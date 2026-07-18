import { z } from "zod";

// ─── Typed contracts between agent and server ─────────────────────────────────
// These are the only shapes that cross the API boundary.
// NO free text fields on any agent-facing surface.

export const MechanismParamsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inventory_print"),
    series: z.string(), // EIA series ID, e.g. "PET.WCRSTUS1.W"
    threshold: z.number(),
    comparator: z.enum(["gt", "lt", "gte", "lte"]),
  }),
  z.object({
    type: z.literal("rate_decision"),
    meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    targetRangeMin: z.number(),
    targetRangeMax: z.number(),
  }),
  z.object({
    type: z.literal("earnings_surprise"),
    ticker: z.string(),
    metric: z.enum(["eps", "revenue"]),
    vsConsensus: z.enum(["beat", "miss", "meet"]),
  }),
  z.object({
    type: z.literal("macro_release"),
    series: z.string(), // BLS/FRED series ID
    threshold: z.number(),
    comparator: z.enum(["gt", "lt", "gte", "lte"]),
  }),
]);

export type MechanismParams = z.infer<typeof MechanismParamsSchema>;

export const ClaimSubmissionSchema = z.object({
  agentId: z.string().uuid(),
  instrument: z.string(),
  direction: z.enum(["up", "down"]),
  confidence: z.number().gt(0.5).lte(1.0),
  mechanismType: z.enum([
    "inventory_print",
    "rate_decision",
    "earnings_surprise",
    "macro_release",
  ]),
  mechanismParams: z.record(z.unknown()),
  falsifier: z.record(z.unknown()),
  horizonEndsAt: z.string().datetime(),
  // These are for config binding (INVARIANT 4)
  config: z.object({
    modelId: z.string(),
    modelVersion: z.string(),
    systemPrompt: z.string(),
    toolNames: z.array(z.string()),
  }),
  // Optional sealed commit (pre-hashed by agent)
  sealedCommit: z.string().optional(), // hex
  // agentSignature over canonical(this object + server_nonce + timestamp)
  agentSignature: z.string(), // hex
  serverNonce: z.string(), // hex
  timestamp: z.string().datetime(),
});

export type ClaimSubmission = z.infer<typeof ClaimSubmissionSchema>;

// ─── Agent-facing feed claim DTO ─────────────────────────────────────────────
// INVARIANT 5: NO rationale_text, NO systemPrompt, NO free text.
// Only typed structured fields.

export interface FeedClaim {
  id: string;
  agentId: string;
  configHash: string;
  instrument: string;
  direction: "up" | "down";
  confidence: number;
  mechanismType: "inventory_print" | "rate_decision" | "earnings_surprise" | "macro_release";
  mechanismParams: Record<string, unknown>;
  falsifier: Record<string, unknown>;
  horizonEndsAt: string;
  referencePrice: string;
  sealedCommit: string | null; // hex, null for open claims
  receivedAt: string;
  resolution?: FeedResolution;
}

export interface FeedResolution {
  outcome: boolean;
  mechanismHit: boolean;
  beatBenchmark: boolean;
  brierScore: number;
  resolvedAt: string;
}

// ─── Feed response envelope ───────────────────────────────────────────────────

export interface FeedResponse {
  claims: FeedClaim[];
  nextPollAfter: string; // ISO 8601 datetime — server-controlled killswitch
  etag: string;
}

// ─── Leaderboard DTO ─────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  operatorId: string;
  configHash: string;
  modelId: string;
  modelVersion: string;
  // Active / ever-registered denominator (INVARIANT 3)
  agentsActive: number;
  agentsEverRegistered: number;
  resolvedClaimCount: number;
  meanBrierScore: number;
  mechanismHitRate: number;
  mechanismHitWilsonLower: number;
  mechanismHitWilsonUpper: number;
  skillCount: number;
  luckCount: number;
  rightCallBadTradeCount: number;
  wrongCount: number;
  // Null if operator has not consented or not paid
  visible: boolean;
}
