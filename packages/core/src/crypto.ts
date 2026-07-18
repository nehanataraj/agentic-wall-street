import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

// ─── Ed25519 utilities ────────────────────────────────────────────────────────

/** Verify an Ed25519 signature. Returns true if valid. */
export function verifyEd25519(
  publicKeyHex: string,
  message: Uint8Array,
  signatureHex: string
): boolean {
  try {
    return ed25519.verify(signatureHex, message, publicKeyHex);
  } catch {
    return false;
  }
}

/** Sign with an Ed25519 private key seed (32 bytes hex). */
export function signEd25519(
  privateKeySeedHex: string,
  message: Uint8Array
): Uint8Array {
  const sig = ed25519.sign(message, privateKeySeedHex);
  return sig;
}

/** Derive the Ed25519 public key from a seed (32 bytes hex). */
export function getPublicKey(privateKeySeedHex: string): Uint8Array {
  return ed25519.getPublicKey(privateKeySeedHex);
}

// ─── Config hashing — INVARIANT 4 ────────────────────────────────────────────
//
// Hash = sha256(
//   length_prefix(model_id) ||
//   length_prefix(model_version) ||
//   length_prefix(system_prompt) ||
//   length_prefix(sorted_tool_names joined with NUL)
// )
//
// Length prefix is a 4-byte big-endian uint32 of the UTF-8 byte length.
// Sorting is lexicographic on the tool name strings.

function lengthPrefix(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const buf = new Uint8Array(4 + bytes.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, bytes.length, false); // big-endian
  buf.set(bytes, 4);
  return buf;
}

export interface ConfigHashInput {
  modelId: string;
  modelVersion: string;
  systemPrompt: string;
  toolNames: string[];
}

export function hashConfig(input: ConfigHashInput): string {
  const sortedTools = [...input.toolNames].sort().join("\x00");
  const parts = [
    lengthPrefix(input.modelId),
    lengthPrefix(input.modelVersion),
    lengthPrefix(input.systemPrompt),
    lengthPrefix(sortedTools),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return bytesToHex(sha256(buf));
}

// ─── Canonical claim payload encoding (RFC 8785-like deterministic JSON) ─────

/** Deterministic JSON serialization: sorted keys, no whitespace. */
export function canonicalJson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(stableJson(obj));
}

function stableJson(val: unknown): string {
  if (val === null) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return JSON.stringify(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(stableJson).join(",")}]`;
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`Cannot serialize ${typeof val}`);
}

// ─── Server countersignature payload ─────────────────────────────────────────

export interface CountersigPayload {
  claimPayload: Record<string, unknown>;
  exposureState: "exposed" | "blind";
  assignmentWindow: string;
  referencePrice: string;
  receivedAt: string; // ISO 8601
}

export function encodeCountersigPayload(p: CountersigPayload): Uint8Array {
  return canonicalJson(p);
}

// ─── Nonce handling ───────────────────────────────────────────────────────────

export function sha256Hex(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes));
}

export { bytesToHex, hexToBytes };
