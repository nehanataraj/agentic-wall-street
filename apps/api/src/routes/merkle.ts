import { Router } from "express";
import type { Request, Response } from "express";
import type { AppDb } from "@app/db";
import { claims, resolutions, sealedReveals } from "@app/db";
import { verifyMerkleProof, buildMerkleTree, signEd25519, canonicalJson, sha256Hex, hexToBytes, bytesToHex } from "@app/core";
import { getEnv } from "../env.js";
import { eq, desc } from "drizzle-orm";
import { merkleRoots } from "@app/db";

export function createMerkleRouter(db: AppDb): Router {
  const router = Router();
  const env = getEnv();

  // ─── GET /merkle/roots — list published daily roots ──────────────────────
  router.get("/roots", async (_req: Request, res: Response): Promise<void> => {
    const roots = await db
      .select()
      .from(merkleRoots)
      .orderBy(desc(merkleRoots.publishedAt))
      .limit(30);
    res.json(roots.map((r) => ({
      id: r.id,
      dateLabel: r.dateLabel,
      root: r.root,
      leafCount: r.leafCount,
      publicationUrl: r.publicationUrl,
      publishedAt: r.publishedAt.toISOString(),
    })));
  });

  // ─── GET /merkle/verify/:claimId — verify a claim's Merkle inclusion ────
  router.get("/verify/:claimId", async (req: Request, res: Response): Promise<void> => {
    const claimId = String(req.params["id"] ?? "");
    const { root, proof: proofJson } = req.query as { root?: string; proof?: string };

    if (!root || !proofJson) {
      res.status(400).json({ error: "root and proof query params required" });
      return;
    }

    // Load claim to get countersig
    const claimRows = await db.select().from(claims).where(eq(claims.id, claimId));
    const claim = claimRows[0];
    if (!claim) {
      res.status(404).json({ error: "claim_not_found" });
      return;
    }

    let proof: Array<{ sibling: string; position: "left" | "right" }>;
    try {
      proof = JSON.parse(proofJson);
    } catch {
      res.status(400).json({ error: "invalid_proof_json" });
      return;
    }

    const countersig = claim.serverCountersig as Buffer;
    const valid = verifyMerkleProof(claimId, countersig, proof, root);

    res.json({ valid, claimId, root });
  });

  // ─── POST /claims/:id/reveal — reveal a sealed claim ────────────────────
  // Verifies sha256(revealedPayload || nonce) == sealedCommit
  router.post("/claims/:id/reveal", async (req: Request, res: Response): Promise<void> => {
    const claimId = String(req.params["id"] ?? "");
    const { revealedPayload, revealNonce } = req.body as {
      revealedPayload: Record<string, unknown>;
      revealNonce: string;
    };

    const claimRows = await db.select().from(claims).where(eq(claims.id, claimId));
    const claim = claimRows[0];
    if (!claim) {
      res.status(404).json({ error: "claim_not_found" });
      return;
    }
    if (!claim.sealedCommit) {
      res.status(400).json({ error: "claim_is_not_sealed" });
      return;
    }
    if (new Date(claim.horizonEndsAt) > new Date()) {
      res.status(400).json({ error: "horizon_not_reached" });
      return;
    }

    // Verify commit
    const payloadBytes = canonicalJson(revealedPayload);
    const nonceBytes = new TextEncoder().encode(revealNonce);
    const combined = new Uint8Array(payloadBytes.length + nonceBytes.length);
    combined.set(payloadBytes);
    combined.set(nonceBytes, payloadBytes.length);
    const computedCommit = sha256Hex(combined);
    const storedCommit = bytesToHex(claim.sealedCommit as Buffer);

    if (computedCommit !== storedCommit) {
      res.status(422).json({ error: "commit_mismatch" });
      return;
    }

    const serverSig = signEd25519(
      env.SERVER_SIGNING_SEED,
      canonicalJson({ claimId, computedCommit, revealedAt: new Date().toISOString() })
    );

    await db.insert(sealedReveals).values({
      claimId,
      revealedPayload,
      revealNonce,
      serverCountersig: Buffer.from(serverSig),
      revealedAt: new Date(),
    });

    res.json({ revealed: true, claimId });
  });

  return router;
}
