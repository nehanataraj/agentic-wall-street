import type { SimSymbol } from "./types";
import { SIM_SYMBOLS } from "./types";

// ─── Live spot prices, no API key required ──────────────────────────────────
// Coinbase Exchange's public ticker endpoint covers BTC/ETH/SOL/XRP without
// auth. This is intentionally independent from packages/providers — that
// package feeds the audited resolution path with strict tolerances; this
// module only needs a reasonable live price for the paper-trading demo.

const COINBASE_PRODUCT: Record<SimSymbol, string> = {
  "BTC-USD": "BTC-USD",
  "ETH-USD": "ETH-USD",
  "SOL-USD": "SOL-USD",
  "XRP-USD": "XRP-USD",
};

async function fetchOne(symbol: SimSymbol): Promise<number | null> {
  try {
    const product = COINBASE_PRODUCT[symbol];
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${product}/ticker`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: string };
    const price = data.price ? parseFloat(data.price) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Fetch current spot prices for all sim symbols. Falls back to the provided
 * last-known price on a per-symbol basis if the live fetch fails, so a
 * transient network blip never crashes a tick.
 */
export async function fetchSpotPrices(
  lastKnown: Partial<Record<SimSymbol, number>>
): Promise<Record<SimSymbol, number | null>> {
  const results = await Promise.all(
    SIM_SYMBOLS.map(async (symbol) => [symbol, await fetchOne(symbol)] as const)
  );
  const out: Record<string, number | null> = {};
  for (const [symbol, price] of results) {
    out[symbol] = price ?? lastKnown[symbol] ?? null;
  }
  return out as Record<SimSymbol, number | null>;
}
