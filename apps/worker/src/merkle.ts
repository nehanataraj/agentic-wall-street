import type { AppDb } from "@app/db";
import { claims, resolutions, agents, agentEvents, operators, merkleRoots } from "@app/db";
import { buildMerkleTree, signEd25519 } from "@app/core";
import { eq, and, sql, isNotNull, not, desc } from "drizzle-orm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

interface MerkleEnv {
  SERVER_SIGNING_SEED: string;
  MERKLE_S3_ENDPOINT?: string;
  MERKLE_S3_BUCKET?: string;
  MERKLE_S3_REGION?: string;
  MERKLE_S3_ACCESS_KEY?: string;
  MERKLE_S3_SECRET_KEY?: string;
}

export class MerkleWorker {
  private s3: S3Client | null;

  constructor(
    private readonly db: AppDb,
    private readonly env: MerkleEnv
  ) {
    this.s3 =
      env.MERKLE_S3_BUCKET && env.MERKLE_S3_ACCESS_KEY
        ? new S3Client({
            endpoint: env.MERKLE_S3_ENDPOINT,
            region: env.MERKLE_S3_REGION ?? "us-east-1",
            credentials: {
              accessKeyId: env.MERKLE_S3_ACCESS_KEY!,
              secretAccessKey: env.MERKLE_S3_SECRET_KEY!,
            },
          })
        : null;
  }

  async publishDailyRoot(): Promise<void> {
    const today = new Date().toISOString().substring(0, 10);

    // Check if already published today
    const existing = await this.db
      .select()
      .from(merkleRoots)
      .where(eq(merkleRoots.dateLabel, today));
    if (existing.length > 0) {
      console.log(JSON.stringify({ level: "info", msg: "merkle_already_published", date: today }));
      return;
    }

    // Load all claims + countersigs
    const allClaims = await this.db
      .select({ id: claims.id, serverCountersig: claims.serverCountersig })
      .from(claims);

    const entries = allClaims.map((c) => ({
      claimId: c.id,
      countersig: c.serverCountersig as Buffer,
    }));

    const tree = buildMerkleTree(entries);

    // Server signs the root
    const payload = new TextEncoder().encode(
      JSON.stringify({ root: tree.root, date: today, leafCount: entries.length })
    );
    const sig = signEd25519(this.env.SERVER_SIGNING_SEED, payload);

    // Build publishable JSON (proofs included for verification)
    const publication = {
      dateLabel: today,
      root: tree.root,
      leafCount: entries.length,
      leaves: tree.leaves,
      proofs: Object.fromEntries(
        Array.from(tree.proofs.entries()).map(([claimId, proof]) => [claimId, proof])
      ),
      serverSignature: Buffer.from(sig).toString("hex"),
      publishedAt: new Date().toISOString(),
    };

    let publicationUrl: string | null = null;

    // Publish to S3-compatible storage
    if (this.s3 && this.env.MERKLE_S3_BUCKET) {
      const key = `merkle/${today}.json`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.MERKLE_S3_BUCKET,
          Key: key,
          Body: JSON.stringify(publication),
          ContentType: "application/json",
          ACL: "public-read",
        })
      );
      publicationUrl = `${this.env.MERKLE_S3_ENDPOINT ?? "https://s3.amazonaws.com"}/${this.env.MERKLE_S3_BUCKET}/${key}`;
    } else {
      // Log to stdout for local dev
      console.log(JSON.stringify({ level: "info", msg: "merkle_root", ...publication }));
    }

    // Append to ledger (append-only)
    await this.db.insert(merkleRoots).values({
      dateLabel: today,
      root: tree.root,
      leafCount: entries.length,
      serverSignature: Buffer.from(sig),
      publicationUrl,
      publishedAt: new Date(),
    });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "merkle_published",
        date: today,
        root: tree.root,
        leafCount: entries.length,
        url: publicationUrl,
      })
    );
  }
}

// ─── Reputation materialized view (SQL-level) ─────────────────────────────────
// This SQL is run after each resolution batch to keep the view current.
// Reputation is recomputable from the ledger — not source of truth.

export const REPUTATION_VIEW_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS op.reputation AS
WITH scored AS (
  SELECT
    a.operator_id,
    c.config_hash,
    cfg.model_id,
    cfg.model_version,
    r.outcome,
    r.mechanism_hit,
    r.beat_benchmark,
    r.brier_score::float,
    -- Operator agents count
    COUNT(*) OVER (PARTITION BY a.operator_id) AS resolved_count
  FROM ledger.claims c
  JOIN ledger.agents a ON a.id = c.agent_id
  JOIN ledger.configs cfg ON cfg.hash = c.config_hash
  JOIN ledger.resolutions r ON r.claim_id = c.id
  WHERE NOT EXISTS (
    SELECT 1 FROM ledger.agent_events ae
    WHERE ae.agent_id = c.agent_id AND ae.event_type = 'tombstone'
    AND ae.recorded_at < c.received_at
  )
),
aggregated AS (
  SELECT
    operator_id,
    config_hash,
    MAX(model_id) AS model_id,
    MAX(model_version) AS model_version,
    COUNT(*) AS resolved_claim_count,
    AVG(brier_score) AS mean_brier_score,
    SUM(CASE WHEN mechanism_hit THEN 1 ELSE 0 END)::float / COUNT(*) AS mechanism_hit_rate,
    SUM(CASE WHEN outcome AND mechanism_hit THEN 1 ELSE 0 END) AS skill_count,
    SUM(CASE WHEN NOT outcome AND mechanism_hit THEN 1 ELSE 0 END) AS luck_count,
    SUM(CASE WHEN outcome AND NOT mechanism_hit THEN 1 ELSE 0 END) AS right_call_bad_trade_count,
    SUM(CASE WHEN NOT outcome AND NOT mechanism_hit THEN 1 ELSE 0 END) AS wrong_count
  FROM scored
  GROUP BY operator_id, config_hash
),
roster AS (
  SELECT
    operator_id,
    COUNT(*) AS agents_ever_registered,
    COUNT(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM ledger.agent_events ae
      WHERE ae.agent_id = ledger.agents.id AND ae.event_type = 'tombstone'
    )) AS agents_active
  FROM ledger.agents
  GROUP BY operator_id
),
consented AS (
  SELECT id AS operator_id, consented_at IS NOT NULL AS has_consent,
         payment_fingerprint IS NOT NULL AS has_payment
  FROM ledger.operators
)
SELECT
  agg.operator_id,
  agg.config_hash,
  agg.model_id,
  agg.model_version,
  agg.resolved_claim_count,
  agg.mean_brier_score,
  agg.mechanism_hit_rate,
  agg.skill_count,
  agg.luck_count,
  agg.right_call_bad_trade_count,
  agg.wrong_count,
  r.agents_ever_registered,
  r.agents_active,
  c.has_consent AND c.has_payment AS visible
FROM aggregated agg
JOIN roster r USING (operator_id)
JOIN consented c USING (operator_id)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS rep_pk ON op.reputation (operator_id, config_hash);
`;

export async function refreshReputationView(adminDb: AppDb): Promise<void> {
  await adminDb.execute(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY op.reputation" as unknown as Parameters<typeof adminDb.execute>[0]
  );
}
