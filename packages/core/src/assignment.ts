import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// ─── Assignment service — INVARIANT 1 ────────────────────────────────────────
//
// exposure(operator_id, window) = sha256(
//   length_prefix(operator_id) || length_prefix(window) || length_prefix(salt)
// ) mod 2
//
// Result 0 = "blind", 1 = "exposed"
//
// Properties:
//   1. Operator-level (not agent-level) — the operator is the leak channel
//   2. Deterministic — any auditor can reproduce with (operator_id, window, salt)
//   3. Crossover by window — operator is their own control each period

function lp(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const buf = new Uint8Array(4 + bytes.length);
  new DataView(buf.buffer).setUint32(0, bytes.length, false);
  buf.set(bytes, 4);
  return buf;
}

export type ExposureState = "exposed" | "blind";

/**
 * Determine whether an operator is exposed or blind for a given window.
 * @param operatorId  UUID of the operator
 * @param window      ISO week label, e.g. "2026-W29"
 * @param salt        Public 64-hex-char assignment salt from env
 */
export function resolveExposure(
  operatorId: string,
  window: string,
  salt: string
): ExposureState {
  const op = lp(operatorId);
  const win = lp(window);
  const s = lp(salt);
  const buf = new Uint8Array(op.length + win.length + s.length);
  let off = 0;
  buf.set(op, off); off += op.length;
  buf.set(win, off); off += win.length;
  buf.set(s, off);
  const hash = sha256(buf);
  // Use last byte for uniformity (sha256 output is uniform)
  const bit = hash[31]! & 0x01;
  return bit === 1 ? "exposed" : "blind";
}

/**
 * Return the ISO week label for a given Date (or now).
 * Format: "YYYY-WNN" per ISO 8601.
 */
export function currentWindow(date?: Date): string {
  const d = date ?? new Date();
  // ISO week: Thursday of the week
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek = new Date(jan4);
  startOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d.getTime() - startOfWeek.getTime();
  let week = Math.floor(diff / (7 * 86400 * 1000)) + 1;
  let year = d.getFullYear();
  if (week < 1) {
    year--;
    week = isoWeeksInYear(year);
  } else if (week > isoWeeksInYear(year)) {
    year++;
    week = 1;
  }
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function isoWeeksInYear(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return currentWindowFromJan4(dec28);
}

function currentWindowFromJan4(d: Date): number {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek = new Date(jan4);
  startOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d.getTime() - startOfWeek.getTime();
  return Math.floor(diff / (7 * 86400 * 1000)) + 1;
}

/**
 * Compute and return the hex hash used in assignment, for auditor verification.
 */
export function assignmentHash(
  operatorId: string,
  window: string,
  salt: string
): string {
  const op = lp(operatorId);
  const win = lp(window);
  const s = lp(salt);
  const buf = new Uint8Array(op.length + win.length + s.length);
  let off = 0;
  buf.set(op, off); off += op.length;
  buf.set(win, off); off += win.length;
  buf.set(s, off);
  return bytesToHex(sha256(buf));
}
