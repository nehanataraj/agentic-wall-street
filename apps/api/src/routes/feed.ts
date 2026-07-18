import { Router } from "express";
import type { Request, Response } from "express";
import type { AppDb } from "@app/db";
import { claims, resolutions, agents } from "@app/db";
import { resolveExposure, currentWindow } from "@app/core";
import type { FeedResponse, FeedClaim } from "@app/core";
import { createBearerAuth, requireScope } from "../auth.js";
import { getEnv } from "../env.js";
import { eq, and, lte, isNull, desc } from "drizzle-orm";
import { sha256Hex, bytesToHex } from "@app/core";

// ─── Per-agent poll jitter ────────────────────────────────────────────────────
// Deterministic jitter derived from agent_id hash spreads polls across the window.
// This prevents synchronized herding behavior.
function agentJitterMs(agentId: string): number {
  const hash = sha256Hex(agentId);
  // Use first 4 bytes as a number in [0, 60000) ms jitter (up to 60 seconds)
  const value = parseInt(hash.substring(0, 8), 16);
  return value % 60_000;
}

/**
 * INVARIANT 5 enforcement:
 * This function explicitly lists every field returned to agents.
 * rationaleText is NEVER included. systemPrompt is NEVER included.
 * Any future field addition must be explicitly reviewed.
 */
function toFeedClaim(
  row: typeof claims.$inferSelect & {
    resolution?: typeof resolutions.$inferSelect | null;
  }
): FeedClaim {
  // Explicitly construct — do NOT spread row objects
  const claim: FeedClaim = {
    id: row.id,
    agentId: row.agentId,
    configHash: row.configHash,
    instrument: row.instrument,
    direction: row.direction,
    confidence: parseFloat(row.confidence as string),
    mechanismType: row.mechanismType,
    mechanismParams: row.mechanismParams as Record<string, unknown>,
    falsifier: row.falsifier as Record<string, unknown>,
    horizonEndsAt: row.horizonEndsAt.toISOString(),
    referencePrice: row.referencePrice as string,
    sealedCommit: row.sealedCommit ? bytesToHex(row.sealedCommit as Buffer) : null,
    receivedAt: row.receivedAt.toISOString(),
  };

  // NO rationaleText here — INVARIANT 5
  // NO systemPrompt here — INVARIANT 5
  // NO any free text from configs here

  if (row.resolution) {
    claim.resolution = {
      outcome: row.resolution.outcome,
      mechanismHit: row.resolution.mechanismHit,
      beatBenchmark: row.resolution.beatBenchmark,
      brierScore: parseFloat(row.resolution.brierScore as string),
      resolvedAt: row.resolution.resolvedAt.toISOString(),
    };
  }

  return claim;
}

export function createFeedRouter(db: AppDb): Router {
  const router = Router();
  const env = getEnv();
  const bearerAuth = createBearerAuth(env.OIDC_ISSUER, env.OIDC_AUDIENCE);

  router.get(
    "/",
    bearerAuth,
    requireScope("feed:read"),
    async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth!;

      // Determine reading agent's current exposure
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
      const exposure = resolveExposure(
        agent.operatorId,
        window,
        env.ASSIGNMENT_SALT
      );

      // Blind agents see nothing — INVARIANT 1/5
      if (exposure === "blind") {
        const jitter = agentJitterMs(auth.agentId);
        const nextPoll = new Date(Date.now() + 300_000 + jitter).toISOString();
        const body: FeedResponse = {
          claims: [],
          nextPollAfter: nextPoll,
          etag: sha256Hex(`blind:${auth.agentId}:${window}`),
        };
        res.set("ETag", `"${body.etag}"`);
        const ifNoneMatch = req.headers["if-none-match"];
        if (ifNoneMatch === `"${body.etag}"`) {
          res.status(304).end();
          return;
        }
        res.json(body);
        return;
      }

      // Exposed agents see open (non-sealed) resolved claims from this window
      // and prior windows. Never unrevealed sealed claims.
      const now = new Date();
      const rows = await db
        .select()
        .from(claims)
        .leftJoin(resolutions, eq(claims.id, resolutions.claimId))
        .where(
          and(
            // Only open claims (no sealedCommit) or sealed claims that have been revealed
            // Simplified: only null sealedCommit for the feed
            isNull(claims.sealedCommit),
            // Exposed arm only
            eq(claims.exposureState, "exposed")
          )
        )
        .orderBy(desc(claims.receivedAt))
        .limit(200);

      const feedClaims = rows.map((r) =>
        toFeedClaim({ ...r.claims, resolution: r.resolutions })
      );

      const etag = sha256Hex(
        JSON.stringify(feedClaims.map((c) => `${c.id}:${c.resolution?.resolvedAt ?? "pending"}`))
      );

      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === `"${etag}"`) {
        res.status(304).end();
        return;
      }

      const jitter = agentJitterMs(auth.agentId);
      const nextPoll = new Date(Date.now() + 300_000 + jitter).toISOString();

      const body: FeedResponse = {
        claims: feedClaims,
        nextPollAfter: nextPoll,
        etag,
      };

      res.set("ETag", `"${etag}"`);
      res.set("Cache-Control", "private, no-store");
      res.json(body);
    }
  );

  return router;
}
