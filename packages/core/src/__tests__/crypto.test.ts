import { describe, test, expect } from "vitest";
import { hashConfig, canonicalJson } from "../crypto.js";

describe("config hashing", () => {
  const base = {
    modelId: "claude-opus-4",
    modelVersion: "20260101",
    systemPrompt: "You are a trading agent.",
    toolNames: ["get_price", "submit_claim"],
  };

  test("same config produces same hash", () => {
    expect(hashConfig(base)).toBe(hashConfig(base));
  });

  test("tool order does not affect hash", () => {
    const shuffled = { ...base, toolNames: ["submit_claim", "get_price"] };
    expect(hashConfig(base)).toBe(hashConfig(shuffled));
  });

  test("prompt change forks the hash — INVARIANT 4", () => {
    const modified = { ...base, systemPrompt: "You are a different agent." };
    expect(hashConfig(base)).not.toBe(hashConfig(modified));
  });

  test("model version change forks the hash", () => {
    const modified = { ...base, modelVersion: "20270101" };
    expect(hashConfig(base)).not.toBe(hashConfig(modified));
  });

  test("hash is 64-char hex string (sha256)", () => {
    expect(hashConfig(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("canonicalJson", () => {
  test("keys are sorted deterministically", () => {
    const a = new TextDecoder().decode(canonicalJson({ b: 2, a: 1 }));
    const b = new TextDecoder().decode(canonicalJson({ a: 1, b: 2 }));
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2}');
  });
});
