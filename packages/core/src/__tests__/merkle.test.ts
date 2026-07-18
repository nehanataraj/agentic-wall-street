import { describe, test, expect } from "vitest";
import { buildMerkleTree, verifyMerkleProof } from "../merkle.js";

describe("Merkle tree", () => {
  const makeEntries = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      claimId: `claim-${i}`,
      countersig: new TextEncoder().encode(`sig-${i}`),
    }));

  test("single entry tree verifies", () => {
    const entries = makeEntries(1);
    const tree = buildMerkleTree(entries);
    const proof = tree.proofs.get("claim-0")!;
    expect(verifyMerkleProof("claim-0", entries[0]!.countersig, proof, tree.root)).toBe(true);
  });

  test("all entries verify in a 4-leaf tree", () => {
    const entries = makeEntries(4);
    const tree = buildMerkleTree(entries);
    for (const e of entries) {
      const proof = tree.proofs.get(e.claimId)!;
      expect(verifyMerkleProof(e.claimId, e.countersig, proof, tree.root)).toBe(true);
    }
  });

  test("odd number of leaves verifies — 5 entries", () => {
    const entries = makeEntries(5);
    const tree = buildMerkleTree(entries);
    for (const e of entries) {
      const proof = tree.proofs.get(e.claimId)!;
      expect(verifyMerkleProof(e.claimId, e.countersig, proof, tree.root)).toBe(true);
    }
  });

  test("tampered countersig fails verification", () => {
    const entries = makeEntries(4);
    const tree = buildMerkleTree(entries);
    const proof = tree.proofs.get("claim-0")!;
    const tampered = new TextEncoder().encode("TAMPERED");
    expect(verifyMerkleProof("claim-0", tampered, proof, tree.root)).toBe(false);
  });

  test("wrong root fails verification", () => {
    const entries = makeEntries(4);
    const tree = buildMerkleTree(entries);
    const proof = tree.proofs.get("claim-0")!;
    expect(verifyMerkleProof("claim-0", entries[0]!.countersig, proof, "0".repeat(64))).toBe(false);
  });
});
