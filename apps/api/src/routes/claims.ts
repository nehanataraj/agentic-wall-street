import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import type { AppDb } from "@app/db";
import { agents, claims, configs } from "@app/db";
import {
  verifyEd25519,
  hashConfig,
  canonicalJson,
  encodeCountersigPayload,
  signEd25519,
  sha256Hex,
  resolveExposure,
  currentWindow,
  isAllowedInstrument,
  ClaimSubmissionSchema,
} from "@app/core";
import { TwelveDataProvider, MockMarketDataProvider } from "@app/providers";
import type { MarketDataProvider } from "@app/providers";
import { issueNonce, consumeNonce } from "../nonce.js";
import { getEnv } from "../env.js";
import { eq, and } from "drizzle-orm";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export function createClaimRouter(db: AppDb): Router {
  const router = Router();
  const env = getEnv();

  // Build market data providers
  const marketProviders: MarketDataProvider[] = [];
  if (env.TWELVE_DATA_API_KEY) {
    marketProviders.push(new TwelveDataProvider(env.TWELVE_DATA_API_KEY));
  }
  // Always include a second provider slot for redundancy
  // In dev/test, add mock provider if real providers < 2
  if (marketProviders.length < 2) {
    marketProviders.push(new MockMarketDataProvider("mock_fallback", {
      "SPY": 560.00, "QQQ": 480.00, "IWM": 210.00,
      "CL=F": 75.00, "NG=F": 2.80, "EURUSD=X": 1.085,
      "GBPUSD=X": 1.27, "BTC-USD": 65000, "ETH-USD": 3400,
    }));
  }

  // ─── GET /claims/nonce — issue a server nonce ─────────────────────────────
  router.post("/nonce", async (_req: Request, res: Response): Promise<void> => {
    try {
      const raw = await issueNonce(db);
      res.json({ nonce: raw, expiresIn: 300 });
    } catch (err) {
      res.status(500).json({ error: "nonce_issue_failed" });
    }
  });

  // ─── POST /claims — submit a claim ───────────────────────────────────────
  router.post("/", async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = ClaimSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
        return;
      }
      const sub = parsed.data;

      // 1. Validate instrument allowlist
      if (!isAllowedInstrument(sub.instrument)) {
        res.status(422).json({ error: "instrument_not_allowed", instrument: sub.instrument });
        return;
      }

      // 2. Validate horizon is in the future
      const horizon = new Date(sub.horizonEndsAt);
      if (horizon <= new Date()) {
        res.status(422).json({ error: "horizon_in_past" });
        return;
      }

      // 3. Validate agent exists on roster
      const agentRows = await db
        .select()
        .from(agents)
        .where(eq(agents.id, sub.agentId));
      const agent = agentRows[0];
      if (!agent) {
        res.status(403).json({ error: "agent_not_on_roster" });
        return;
      }

      // 4. Verify agent Ed25519 signature
      const payloadForSig = {
        agentId: sub.agentId,
        instrument: sub.instrument,
        direction: sub.direction,
        confidence: sub.confidence,
        mechanismType: sub.mechanismType,
        mechanismParams: sub.mechanismParams,
        falsifier: sub.falsifier,
        horizonEndsAt: sub.horizonEndsAt,
        config: sub.config,
        sealedCommit: sub.sealedCommit ?? null,
        serverNonce: sub.serverNonce,
        timestamp: sub.timestamp,
      };
      const canonicalPayload = canonicalJson(payloadForSig);
      const pubkeyHex = bytesToHex(agent.pubkey as Buffer);
      const sigValid = verifyEd25519(pubkeyHex, canonicalPayload, sub.agentSignature);
      if (!sigValid) {
        res.status(403).json({ error: "invalid_agent_signature" });
        return;
      }

      // 5. Consume nonce (validates + marks used, prevents replay)
      let nonceDigest: string;
      try {
        nonceDigest = await consumeNonce(db, sub.serverNonce);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "nonce_error";
        res.status(422).json({ error: "nonce_invalid", detail: msg });
        return;
      }

      // 6. Hash config and upsert
      const configHash = hashConfig(sub.config);
      await db
        .insert(configs)
        .values({
          hash: configHash,
          modelId: sub.config.modelId,
          modelVersion: sub.config.modelVersion,
          systemPrompt: sub.config.systemPrompt,
          toolNames: sub.config.toolNames,
        })
        .onConflictDoNothing();

      // 7. Resolve assignment — INVARIANT 1: done at write time, stamped on row
      const window = currentWindow();
      const exposureState = resolveExposure(
        agent.operatorId,
        window,
        env.ASSIGNMENT_SALT
      );

      // 8. Fetch reference price server-side — INVARIANT 6
      let referencePrice: number;
      try {
        const priceResult = await marketProviders[0]!.getSpotPrice(sub.instrument);
        referencePrice = priceResult.price;
      } catch {
        res.status(503).json({ error: "price_fetch_failed" });
        return;
      }

      // 9. Server countersign
      const receivedAt = new Date().toISOString();
      const countersigPayload = encodeCountersigPayload({
        claimPayload: payloadForSig,
        exposureState,
        assignmentWindow: window,
        referencePrice: referencePrice.toString(),
        receivedAt,
      });
      const serverSig = signEd25519(env.SERVER_SIGNING_SEED, countersigPayload);

      // 10. Append claim (append-only)
      const inserted = await db
        .insert(claims)
        .values({
          agentId: sub.agentId,
          configHash,
          exposureState,
          assignmentWindow: window,
          instrument: sub.instrument,
          direction: sub.direction,
          confidence: sub.confidence.toString(),
          mechanismType: sub.mechanismType,
          mechanismParams: sub.mechanismParams,
          falsifier: sub.falsifier,
          horizonEndsAt: new Date(sub.horizonEndsAt),
          referencePrice: referencePrice.toString(),
          sealedCommit: sub.sealedCommit
            ? Buffer.from(hexToBytes(sub.sealedCommit))
            : undefined,
          agentSignature: Buffer.from(hexToBytes(sub.agentSignature)),
          serverCountersig: Buffer.from(serverSig),
          receivedAt: new Date(receivedAt),
          nonceDigest,
        })
        .returning({ id: claims.id });

      const claimId = inserted[0]!.id;

      res.status(201).json({
        claimId,
        exposureState,
        assignmentWindow: window,
        referencePrice: referencePrice.toString(),
        receivedAt,
        serverCountersig: bytesToHex(serverSig),
      });
    } catch (err) {
      console.error("Claim submission error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
