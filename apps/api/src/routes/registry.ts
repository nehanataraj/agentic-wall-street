import { Router } from "express";
import type { Request, Response } from "express";
import type { AppDb } from "@app/db";
import { agents, agentEvents, operators } from "@app/db";
import {
  verifyEd25519,
  signEd25519,
  canonicalJson,
  getPublicKey,
  bytesToHex,
  hexToBytes,
} from "@app/core";
import { getEnv } from "../env.js";
import { eq } from "drizzle-orm";

export function createRegistryRouter(db: AppDb): Router {
  const router = Router();
  const env = getEnv();

  // ─── POST /registry/agents — declare a new agent ────────────────────────
  // Caller is an authenticated operator (OIDC flow handled by web app).
  // Agent pubkey is registered; private key stays with the agent process.
  router.post("/agents", async (req: Request, res: Response): Promise<void> => {
    try {
      const { operatorId, pubkeyHex, displayName } = req.body as {
        operatorId: string;
        pubkeyHex: string;
        displayName: string;
      };

      if (!operatorId || !pubkeyHex || !displayName) {
        res.status(400).json({ error: "missing_fields" });
        return;
      }

      // Verify operator exists
      const opRows = await db
        .select()
        .from(operators)
        .where(eq(operators.id, operatorId));
      if (!opRows[0]) {
        res.status(403).json({ error: "operator_not_found" });
        return;
      }

      const pubkey = hexToBytes(pubkeyHex);

      const inserted = await db
        .insert(agents)
        .values({
          operatorId,
          pubkey: Buffer.from(pubkey),
          displayName,
        })
        .returning({ id: agents.id, declaredAt: agents.declaredAt });

      res.status(201).json(inserted[0]);
    } catch (err) {
      console.error("Agent registration error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // ─── POST /registry/agents/:id/tombstone — kill an agent ────────────────
  // Writes a signed tombstone row. Agent remains on roster with all scores.
  // INVARIANT 3: never removes agent from operator's denominator.
  router.post("/agents/:id/tombstone", async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = String(req.params["id"] ?? "");
      const { operatorNote, agentSignatureHex } = req.body as {
        operatorNote?: string;
        agentSignatureHex?: string;
      };

      const agentRows = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId));
      const agent = agentRows[0];
      if (!agent) {
        res.status(404).json({ error: "agent_not_found" });
        return;
      }

      // Check not already tombstoned
      const existingTombstone = await db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.agentId, agentId));
      if (existingTombstone.some((e) => e.eventType === "tombstone")) {
        res.status(409).json({ error: "agent_already_tombstoned" });
        return;
      }

      // Server countersigns the tombstone
      const tombstonePayload = canonicalJson({
        agentId,
        eventType: "tombstone",
        operatorNote: operatorNote ?? null,
        recordedAt: new Date().toISOString(),
      });
      const serverSig = signEd25519(env.SERVER_SIGNING_SEED, tombstonePayload);

      await db.insert(agentEvents).values({
        agentId,
        eventType: "tombstone",
        operatorNote: operatorNote ?? null,
        agentSignature: agentSignatureHex ? Buffer.from(hexToBytes(agentSignatureHex)) : null,
        serverCountersig: Buffer.from(serverSig),
        recordedAt: new Date(),
      });

      res.status(200).json({ tombstoned: true, agentId });
    } catch (err) {
      console.error("Tombstone error:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
