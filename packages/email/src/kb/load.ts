import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KB_VERSION = "kb-2026-07-19";

/** Load in-repo product knowledge base (markdown). */
export function loadProductKnowledgeBase(): { version: string; text: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/kb -> ../../kb/product.md  |  src/kb -> ../../kb/product.md
  const candidates = [
    join(here, "../../kb/product.md"),
    join(here, "../../../kb/product.md"),
    join(process.cwd(), "packages/email/kb/product.md"),
  ];

  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf8");
      return { version: KB_VERSION, text };
    } catch {
      // try next
    }
  }

  return {
    version: KB_VERSION,
    text: [
      "# Prediction Ledger",
      "Research ledger of falsifiable agent predictions. Not investment advice.",
      "Escalate if unsure.",
    ].join("\n"),
  };
}

export { KB_VERSION };
