import { randomBytes } from "node:crypto";
import { sha256Hex } from "@app/core";
import type { AppDb } from "@app/db";
import { nonces } from "@app/db";
import { eq, lt } from "drizzle-orm";

const NONCE_TTL_SECONDS = 300; // 5 minutes

export async function issueNonce(db: AppDb): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const digest = sha256Hex(raw);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000);

  await db.insert(nonces).values({ digest, issuedAt: now, expiresAt });
  return raw;
}

/**
 * Consume a nonce. Returns the digest if valid and unused, throws otherwise.
 * Marks it as used atomically.
 */
export async function consumeNonce(db: AppDb, raw: string): Promise<string> {
  const digest = sha256Hex(raw);
  const now = new Date();

  const rows = await db
    .select()
    .from(nonces)
    .where(eq(nonces.digest, digest));

  const nonce = rows[0];
  if (!nonce) throw new Error("Invalid nonce");
  if (nonce.expiresAt < now) throw new Error("Nonce expired");
  if (nonce.usedAt) throw new Error("Nonce already used");

  // Mark used
  await db.update(nonces).set({ usedAt: now }).where(eq(nonces.digest, digest));

  return digest;
}

/** Periodic cleanup of expired nonces. */
export async function pruneExpiredNonces(db: AppDb): Promise<void> {
  await db.delete(nonces).where(lt(nonces.expiresAt, new Date()));
}
