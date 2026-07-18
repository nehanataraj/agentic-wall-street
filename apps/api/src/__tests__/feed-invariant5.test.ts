import { describe, test, expect } from "vitest";
import type { FeedClaim, FeedResponse } from "@app/core";

/**
 * Acceptance test: agent-facing feed DTO must contain zero free-text fields.
 * INVARIANT 5: rationaleText is stored, never returned to agents.
 */
describe("Feed DTO — zero free-text fields (INVARIANT 5)", () => {
  const FREE_TEXT_FIELDS = [
    "rationaleText",
    "rationale_text",
    "systemPrompt",
    "system_prompt",
    "comment",
    "description",
    "note",
    "reason",
    "rationale",
  ] as const;

  function assertNoFreeText(obj: unknown, path = ""): void {
    if (typeof obj !== "object" || obj === null) return;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const fullPath = path ? `${path}.${key}` : key;
      expect(
        FREE_TEXT_FIELDS.includes(key as (typeof FREE_TEXT_FIELDS)[number]),
        `Free-text field "${fullPath}" found in feed DTO — INVARIANT 5 violation`
      ).toBe(false);
      assertNoFreeText((obj as Record<string, unknown>)[key], fullPath);
    }
  }

  test("FeedClaim shape has no free-text fields", () => {
    const sampleClaim: FeedClaim = {
      id: "test-id",
      agentId: "agent-id",
      configHash: "abc123",
      instrument: "SPY",
      direction: "up",
      confidence: 0.75,
      mechanismType: "inventory_print",
      mechanismParams: { type: "inventory_print", series: "PET.W", threshold: 0, comparator: "lt" },
      falsifier: { type: "price_change" },
      horizonEndsAt: "2026-08-01T00:00:00Z",
      referencePrice: "560.00",
      sealedCommit: null,
      receivedAt: "2026-07-17T00:00:00Z",
    };

    assertNoFreeText(sampleClaim);
  });

  test("FeedResponse shape has no free-text fields", () => {
    const sampleResponse: FeedResponse = {
      claims: [],
      nextPollAfter: "2026-07-17T00:05:00Z",
      etag: "abc123",
    };

    assertNoFreeText(sampleResponse);
  });

  test("FeedClaim with resolution has no free-text fields", () => {
    const sampleClaim: FeedClaim = {
      id: "test-id",
      agentId: "agent-id",
      configHash: "abc123",
      instrument: "SPY",
      direction: "up",
      confidence: 0.75,
      mechanismType: "inventory_print",
      mechanismParams: {},
      falsifier: {},
      horizonEndsAt: "2026-08-01T00:00:00Z",
      referencePrice: "560.00",
      sealedCommit: null,
      receivedAt: "2026-07-17T00:00:00Z",
      resolution: {
        outcome: true,
        mechanismHit: true,
        beatBenchmark: true,
        brierScore: 0.0625,
        resolvedAt: "2026-08-02T00:00:00Z",
      },
    };
    assertNoFreeText(sampleClaim);
  });
});
