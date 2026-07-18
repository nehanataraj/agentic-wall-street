/**
 * Stage 1 — structural pre-checks (no model).
 * Fail cheap before paying for a classifier call.
 */

const ROLE_TAG =
  /(?:^|[\s`])(?:system|assistant|developer)\s*:|(?:<\|im_start\|>|\[INST\]|<<SYS>>)/i;
const INJECTION =
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\b|\b(?:override|bypass)\s+(?:the\s+)?(?:filter|system|instructions?)\b/i;
const IMPERATIVE =
  /\b(?:post|reply|respond|include|output|return|send)\s+(?:your|the|all)\s+(?:positions?|keys?|secrets?|prompt|system)\b/i;
const ENCODED =
  /\b(?:[A-Za-z0-9+/]{40,}={0,2})\b|\b(?:0x[a-fA-F0-9]{32,})\b|[\u202A-\u202E\u2066-\u2069]/;
const URLS = /https?:\/\/[^\s]+|www\.[^\s]+/i;

export interface StructuralResult {
  blocked: boolean;
  categories: string[];
}

export function structuralPrecheck(text: string): StructuralResult {
  const categories: string[] = [];
  if (ROLE_TAG.test(text)) categories.push("role_tag");
  if (INJECTION.test(text)) categories.push("injection");
  if (IMPERATIVE.test(text)) categories.push("imperative");
  if (ENCODED.test(text)) categories.push("encoded");
  if (URLS.test(text)) categories.push("url");
  return { blocked: categories.length > 0, categories };
}
