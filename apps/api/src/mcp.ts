import { Router } from "express";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppDb } from "@app/db";
import { claims, resolutions, agents } from "@app/db";
import { resolveExposure, currentWindow, sha256Hex } from "@app/core";
import type { FeedClaim } from "@app/core";
import { createBearerAuth, requireScope } from "./auth.js";
import { getEnv } from "./env.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Hosted remote MCP server using Streamable HTTP transport, stateless mode.
 * OAuth Bearer auth via the same OIDC provider as the REST API.
 *
 * INVARIANT 5: No free text crosses the agent-to-agent boundary.
 * All tools return typed objects only. No rationale, no prompts, no comments.
 *
 * Published client-side recommendation:
 * The reading agent and the trading agent should be separate processes.
 * The reader holds no execution capability. Decision objects cross the boundary.
 */

function createMcpHandler(db: AppDb, env: ReturnType<typeof getEnv>) {
  return async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    // Determine exposure for reading agent
    const agentRows = await db
      .select({ operatorId: agents.operatorId })
      .from(agents)
      .where(eq(agents.id, auth.agentId));
    const agent = agentRows[0];
    if (!agent) {
      res.status(403).json({ error: "agent_not_on_roster" });
      return;
    }

    const window = currentWindow();
    const exposure = resolveExposure(agent.operatorId, window, env.ASSIGNMENT_SALT);

    // Build a per-request server with auth-scoped tool implementations
    const server = new McpServer({ name: "prediction-feed", version: "1.0.0" });

    server.tool(
      "get_feed_claims",
      "Get scored prediction claims. Returns typed structured data only. No rationale or free text.",
      {
        instrument: z.string().optional().describe("Filter by instrument symbol"),
        limit: z.number().int().min(1).max(100).default(50),
      },
      async ({ instrument, limit }) => {
        if (exposure === "blind") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  claims: [],
                  exposure: "blind",
                  nextPollAfter: new Date(Date.now() + 300_000).toISOString(),
                }),
              },
            ],
          };
        }

        const rows = await db
          .select()
          .from(claims)
          .leftJoin(resolutions, eq(claims.id, resolutions.claimId))
          .where(and(isNull(claims.sealedCommit), eq(claims.exposureState, "exposed")))
          .orderBy(desc(claims.receivedAt))
          .limit(limit);

        // INVARIANT 5: explicit typed fields only — NO rationaleText
        const feedClaims = rows
          .filter((r) => !instrument || r.claims.instrument === instrument)
          .map((r): FeedClaim => ({
            id: r.claims.id,
            agentId: r.claims.agentId,
            configHash: r.claims.configHash,
            instrument: r.claims.instrument,
            direction: r.claims.direction,
            confidence: parseFloat(r.claims.confidence as string),
            mechanismType: r.claims.mechanismType,
            mechanismParams: r.claims.mechanismParams as Record<string, unknown>,
            falsifier: r.claims.falsifier as Record<string, unknown>,
            horizonEndsAt: r.claims.horizonEndsAt.toISOString(),
            referencePrice: r.claims.referencePrice as string,
            sealedCommit: r.claims.sealedCommit
              ? bytesToHex(r.claims.sealedCommit as unknown as Uint8Array)
              : null,
            receivedAt: r.claims.receivedAt.toISOString(),
            ...(r.resolutions
              ? {
                  resolution: {
                    outcome: r.resolutions.outcome,
                    mechanismHit: r.resolutions.mechanismHit,
                    beatBenchmark: r.resolutions.beatBenchmark,
                    brierScore: parseFloat(r.resolutions.brierScore as string),
                    resolvedAt: r.resolutions.resolvedAt.toISOString(),
                  },
                }
              : {}),
          }));

        const jitter = parseInt(sha256Hex(auth.agentId).substring(0, 8), 16) % 60_000;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                claims: feedClaims,
                exposure: "exposed",
                nextPollAfter: new Date(Date.now() + 300_000 + jitter).toISOString(),
              }),
            },
          ],
        };
      }
    );

    server.tool(
      "get_leaderboard",
      "Get operator/config leaderboard ranked by Brier score. Returns typed structured data only.",
      {
        limit: z.number().int().min(1).max(50).default(20),
      },
      async ({ limit }) => {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "leaderboard_pending_reputation_view", limit }),
            },
          ],
        };
      }
    );

    // Stateless transport — no session state, no sticky routing
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined as unknown as () => string,
    });

    await server.connect(transport);

    const nodeReq = req as unknown as import("node:http").IncomingMessage;
    const nodeRes = res as unknown as import("node:http").ServerResponse;
    await transport.handleRequest(nodeReq, nodeRes, req.body as Record<string, unknown>);
  };
}

export function createMcpRouter(db: AppDb): Router {
  const router = Router();
  const env = getEnv();
  const bearerAuth = createBearerAuth(env.OIDC_ISSUER, env.OIDC_AUDIENCE);
  const handler = createMcpHandler(db, env);

  router.all("/", bearerAuth, requireScope("feed:read"), handler);

  return router;
}
