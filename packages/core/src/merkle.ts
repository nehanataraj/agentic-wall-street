import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// ─── Merkle tree over claim IDs + countersigs ─────────────────────────────────
//
// Leaf = sha256(claim_id_bytes || countersig_bytes)
// Internal = sha256(left_child || right_child)
// Odd number of leaves: duplicate last leaf.
//
// Anyone can verify a claim was in the tree using just the proof path.
// Daily roots are signed by the server key and published publicly.

export type MerkleProof = Array<{ sibling: string; position: "left" | "right" }>;

export interface MerkleTree {
  root: string;
  leaves: string[];
  proofs: Map<string, MerkleProof>;
}

function hashLeaf(claimId: string, countersig: Uint8Array): string {
  const idBytes = new TextEncoder().encode(claimId);
  const buf = new Uint8Array(idBytes.length + countersig.length);
  buf.set(idBytes);
  buf.set(countersig, idBytes.length);
  return bytesToHex(sha256(buf));
}

function hashNode(left: string, right: string): string {
  const l = Buffer.from(left, "hex");
  const r = Buffer.from(right, "hex");
  const buf = new Uint8Array(l.length + r.length);
  buf.set(l);
  buf.set(r, l.length);
  return bytesToHex(sha256(buf));
}

export function buildMerkleTree(
  entries: Array<{ claimId: string; countersig: Uint8Array }>
): MerkleTree {
  if (entries.length === 0) {
    const empty = bytesToHex(sha256(new Uint8Array(0)));
    return { root: empty, leaves: [], proofs: new Map() };
  }

  const leaves = entries.map((e) => hashLeaf(e.claimId, e.countersig));
  const leafToClaimId = new Map(leaves.map((l, i) => [l, entries[i]!.claimId]));

  // Build tree level by level
  let level = [...leaves];
  const levels: string[][] = [level];

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // duplicate last if odd
      next.push(hashNode(left, right));
    }
    level = next;
    levels.push(level);
  }

  const root = levels[levels.length - 1]![0]!;

  // Build proof for each leaf
  const proofs = new Map<string, MerkleProof>();
  for (let leafIdx = 0; leafIdx < leaves.length; leafIdx++) {
    const claimId = entries[leafIdx]!.claimId;
    const proof: MerkleProof = [];
    let idx = leafIdx;
    for (let lvl = 0; lvl < levels.length - 1; lvl++) {
      const currentLevel = levels[lvl]!;
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling = currentLevel[siblingIdx] ?? currentLevel[idx]!; // duplicate
      proof.push({ sibling, position: idx % 2 === 0 ? "right" : "left" });
      idx = Math.floor(idx / 2);
    }
    proofs.set(claimId, proof);
  }

  return { root, leaves, proofs };
}

export function verifyMerkleProof(
  claimId: string,
  countersig: Uint8Array,
  proof: MerkleProof,
  expectedRoot: string
): boolean {
  let current = hashLeaf(claimId, countersig);
  for (const step of proof) {
    current =
      step.position === "right"
        ? hashNode(current, step.sibling)
        : hashNode(step.sibling, current);
  }
  return current === expectedRoot;
}
