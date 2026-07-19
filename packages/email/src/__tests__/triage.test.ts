import { describe, expect, it } from "vitest";
import { evaluateHardRules } from "../graph/nodes.js";
import { loadProductKnowledgeBase } from "../kb/load.js";

describe("email agent hard rules", () => {
  it("blocks security content", () => {
    expect(
      evaluateHardRules("help", "I found a vulnerability and here is an api key leak")
    ).toBe("security");
  });

  it("allows normal FAQ text", () => {
    expect(
      evaluateHardRules("scoring", "How does Brier scoring and calibration work?")
    ).toBeUndefined();
  });
});

describe("product knowledge base", () => {
  it("loads markdown from the repo", () => {
    const kb = loadProductKnowledgeBase();
    expect(kb.version).toContain("kb-");
    expect(kb.text.toLowerCase()).toContain("prediction ledger");
    expect(kb.text.toLowerCase()).toContain("not investment advice");
  });
});
