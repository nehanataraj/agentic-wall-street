import {
  pgSchema,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  numeric,
  jsonb,
  integer,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// PostgreSQL bytea column
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Shorthand for timestamp with timezone
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ─── Ledger schema ────────────────────────────────────────────────────────────
// Every table in this schema is append-only.
// The application role (app) has SELECT + INSERT only.
// UPDATE and DELETE are explicitly revoked in the post-migration SQL.
// ─────────────────────────────────────────────────────────────────────────────

export const ledger = pgSchema("ledger");

// ─── Enums ────────────────────────────────────────────────────────────────────

export const exposureStateEnum = pgEnum("exposure_state", ["exposed", "blind"]);

export const directionEnum = pgEnum("direction", ["up", "down"]);

export const mechanismTypeEnum = pgEnum("mechanism_type", [
  "inventory_print",
  "rate_decision",
  "earnings_surprise",
  "macro_release",
]);

export const claimEventTypeEnum = pgEnum("claim_event_type", [
  "original",
  "correction",
  "retraction",
]);

// ─── operators ───────────────────────────────────────────────────────────────
// Append-only declarations. consentedAt must be non-null for leaderboard.
// paymentFingerprint deduplicates Stripe cardholders for eligibility gating.

export const operators = ledger.table("operators", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  paymentFingerprint: text("payment_fingerprint"),
  consentedAt: timestamptz("consented_at"),
  consentVersion: text("consent_version"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

// ─── agents ───────────────────────────────────────────────────────────────────
// One row per declared agent. Never deleted.
// tombstonedAt is populated via a joined view over agent_events; the column here
// stays NULL always — the event log is the source of truth.

export const agents = ledger.table("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  operatorId: uuid("operator_id")
    .notNull()
    .references(() => operators.id),
  // Ed25519 public key (32 bytes). Only the public key. Never a private key.
  pubkey: bytea("pubkey").notNull(),
  declaredAt: timestamptz("declared_at").notNull().default(sql`now()`),
  displayName: text("display_name").notNull(),
});

// ─── agent_events ────────────────────────────────────────────────────────────
// Tombstone rows for killed agents. eventType: 'tombstone' only for now.
// Signed by operator's agent key and server countersig.

export const agentEvents = ledger.table("agent_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  eventType: text("event_type").notNull(), // 'tombstone'
  operatorNote: text("operator_note"),
  agentSignature: bytea("agent_signature"),
  serverCountersig: bytea("server_countersig"),
  recordedAt: timestamptz("recorded_at").notNull().default(sql`now()`),
});

// ─── configs ─────────────────────────────────────────────────────────────────
// Insert-if-absent. Hash is pk. Cross-model calibration data is first-class.
// Any change to model, version, prompt, or tools produces a new hash.

export const configs = ledger.table("configs", {
  hash: text("hash").primaryKey(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  toolNames: text("tool_names")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  firstSeenAt: timestamptz("first_seen_at").notNull().default(sql`now()`),
});

// ─── claims ───────────────────────────────────────────────────────────────────
// Core ledger table. Append-only. One row per original claim submission.
// exposureState is stamped at write time — INVARIANT 1.
// referencePrice is fetched server-side — INVARIANT 6.
// rationalText is stored but NEVER returned by agent-facing surfaces — INVARIANT 5.

export const claims = ledger.table("claims", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  configHash: text("config_hash")
    .notNull()
    .references(() => configs.hash),
  // INVARIANT 1: resolved by assignment service at write time
  exposureState: exposureStateEnum("exposure_state").notNull(),
  assignmentWindow: text("assignment_window").notNull(), // e.g. "2026-W29"
  instrument: text("instrument").notNull(),
  direction: directionEnum("direction").notNull(),
  // (0.5, 1.0] — mandatory for scoring
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  mechanismType: mechanismTypeEnum("mechanism_type").notNull(),
  mechanismParams: jsonb("mechanism_params").notNull(),
  falsifier: jsonb("falsifier").notNull(),
  horizonEndsAt: timestamptz("horizon_ends_at").notNull(),
  // server-fetched, never client-supplied — INVARIANT 6
  referencePrice: numeric("reference_price", { precision: 20, scale: 8 }).notNull(),
  // stored for human web surface only — NEVER returned to agents — INVARIANT 5
  rationaleText: text("rationale_text"),
  // sealed commit: sha256(canonical_payload || nonce) — null for open claims
  sealedCommit: bytea("sealed_commit"),
  // Ed25519 signature by agent over canonical(payload || server_nonce || timestamp)
  agentSignature: bytea("agent_signature").notNull(),
  // Ed25519 signature by server over {payload, exposure_state, assignment_window, reference_price, received_at}
  serverCountersig: bytea("server_countersig").notNull(),
  receivedAt: timestamptz("received_at").notNull().default(sql`now()`),
  // nonce digest (sha256) to prevent replay
  nonceDigest: text("nonce_digest").notNull(),
});

// ─── claim_events ─────────────────────────────────────────────────────────────
// Corrections and retractions. Never modifies claims rows.

export const claimEvents = ledger.table("claim_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  originalClaimId: uuid("original_claim_id")
    .notNull()
    .references(() => claims.id),
  eventType: claimEventTypeEnum("event_type").notNull(),
  replacementClaimId: uuid("replacement_claim_id").references(() => claims.id),
  serverCountersig: bytea("server_countersig").notNull(),
  recordedAt: timestamptz("recorded_at").notNull().default(sql`now()`),
});

// ─── resolutions ─────────────────────────────────────────────────────────────
// One row per resolved claim. Append-only.
// mechanismHit resolves independently of price.

export const resolutions = ledger.table("resolutions", {
  claimId: uuid("claim_id")
    .primaryKey()
    .references(() => claims.id),
  outcome: boolean("outcome").notNull(),
  mechanismHit: boolean("mechanism_hit").notNull(),
  resolutionPrice: numeric("resolution_price", { precision: 20, scale: 8 }).notNull(),
  benchmarkReturn: numeric("benchmark_return", { precision: 12, scale: 8 }).notNull(),
  instrumentReturn: numeric("instrument_return", { precision: 12, scale: 8 }).notNull(),
  // Binary: did instrument beat benchmark?
  beatBenchmark: boolean("beat_benchmark").notNull(),
  // Brier score = (confidence - beatBenchmark)^2 — lower is better
  brierScore: numeric("brier_score", { precision: 8, scale: 6 }).notNull(),
  sources: jsonb("sources").notNull(),
  resolvedAt: timestamptz("resolved_at").notNull().default(sql`now()`),
});

// ─── sealed_reveals ──────────────────────────────────────────────────────────
// Reveal row for sealed claims. Commit is on the claim row.
// Server verifies sha256(revealed_payload || nonce) == sealedCommit.

export const sealedReveals = ledger.table("sealed_reveals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => claims.id),
  revealedPayload: jsonb("revealed_payload").notNull(),
  revealNonce: text("reveal_nonce").notNull(),
  serverCountersig: bytea("server_countersig").notNull(),
  revealedAt: timestamptz("revealed_at").notNull().default(sql`now()`),
});

// ─── merkle_roots ─────────────────────────────────────────────────────────────
// Daily append-only. Anyone can independently verify the root.

export const merkleRoots = ledger.table("merkle_roots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dateLabel: text("date_label").notNull(), // e.g. "2026-07-17"
  root: text("root").notNull(), // hex sha256 Merkle root
  leafCount: integer("leaf_count").notNull(),
  serverSignature: bytea("server_signature").notNull(),
  publicationUrl: text("publication_url"),
  publishedAt: timestamptz("published_at").notNull().default(sql`now()`),
});

// ─── nonces ───────────────────────────────────────────────────────────────────
// Short-lived server-issued nonces. Stored in operational schema (not ledger).
// Not append-only — operational schema has normal permissions.

export const opSchema = pgSchema("op");

export const nonces = opSchema.table("nonces", {
  digest: text("digest").primaryKey(), // sha256(nonce_bytes) hex
  issuedAt: timestamptz("issued_at").notNull().default(sql`now()`),
  expiresAt: timestamptz("expires_at").notNull(),
  usedAt: timestamptz("used_at"),
});

// ─── operator_auth ────────────────────────────────────────────────────────────
// OIDC subject mappings — operational schema, not ledger.

export const operatorAuth = opSchema.table("operator_auth", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  operatorId: uuid("operator_id").notNull(),
  oidcSubject: text("oidc_subject").notNull(),
  oidcIssuer: text("oidc_issuer").notNull(),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

// ─── oauth_tokens ─────────────────────────────────────────────────────────────
// Agent access tokens for the feed API — operational schema.

export const oauthTokens = opSchema.table("oauth_tokens", {
  tokenHash: text("token_hash").primaryKey(), // sha256(token) — never store raw
  agentId: uuid("agent_id").notNull(),
  operatorId: uuid("operator_id").notNull(),
  scopes: text("scopes").array().notNull(),
  issuedAt: timestamptz("issued_at").notNull().default(sql`now()`),
  expiresAt: timestamptz("expires_at").notNull(),
  revokedAt: timestamptz("revoked_at"),
});
