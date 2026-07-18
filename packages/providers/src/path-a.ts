// ─── Coinbase Exchange + Kraken Path A resolvers ─────────────────────────────
// Launch instruments: BTC-USD, ETH-USD. TWAP over horizon; reconcile with 10bp.
// Raw prices are inputs — never publish on public claim DTOs.

import type { MarketDataProvider, TwapResult, PriceResult, PriceBar } from "./market.js";

const COINBASE_PRODUCT: Record<string, string> = {
  "BTC-USD": "BTC-USD",
  "ETH-USD": "ETH-USD",
};

const KRAKEN_PAIR: Record<string, string> = {
  "BTC-USD": "XBTUSD",
  "ETH-USD": "ETHUSD",
};

export const PATH_A_TOLERANCE: Record<string, number> = {
  "BTC-USD": 0.001,
  "ETH-USD": 0.001,
};

export class CoinbaseProvider implements MarketDataProvider {
  readonly name = "coinbase";

  async getSpotPrice(symbol: string): Promise<PriceResult> {
    const product = COINBASE_PRODUCT[symbol];
    if (!product) throw new Error(`Coinbase: unsupported ${symbol}`);
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${product}/ticker`
    );
    if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
    const data = (await res.json()) as { price: string; time: string };
    return {
      provider: this.name,
      symbol,
      price: parseFloat(data.price),
      timestamp: data.time ?? new Date().toISOString(),
    };
  }

  async getTwap(symbol: string, from: Date, to: Date): Promise<TwapResult> {
    const product = COINBASE_PRODUCT[symbol];
    if (!product) throw new Error(`Coinbase: unsupported ${symbol}`);
    const bars = await this.fetchHourly(product, from, to);
    if (!bars.length) throw new Error(`Coinbase: no bars for ${symbol}`);
    const reps = bars.map((b) => (b.high + b.low + b.close) / 3);
    const twap = reps.reduce((a, b) => a + b, 0) / reps.length;
    return {
      provider: this.name,
      symbol,
      twap,
      windowStart: from.toISOString(),
      windowEnd: to.toISOString(),
      barCount: bars.length,
    };
  }

  private async fetchHourly(
    product: string,
    from: Date,
    to: Date
  ): Promise<PriceBar[]> {
    const out: PriceBar[] = [];
    let cursor = Math.floor(from.getTime() / 1000);
    const end = Math.floor(to.getTime() / 1000);
    while (cursor < end) {
      const chunkEnd = Math.min(cursor + 300 * 3600, end);
      const url =
        `https://api.exchange.coinbase.com/products/${product}/candles` +
        `?granularity=3600&start=${new Date(cursor * 1000).toISOString()}` +
        `&end=${new Date(chunkEnd * 1000).toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Coinbase candles HTTP ${res.status}`);
      const rows = (await res.json()) as number[][];
      for (const r of rows) {
        out.push({
          time: new Date(r[0]! * 1000).toISOString(),
          low: r[1]!,
          high: r[2]!,
          open: r[3]!,
          close: r[4]!,
          volume: r[5]!,
        });
      }
      cursor = chunkEnd;
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }
}

export class KrakenProvider implements MarketDataProvider {
  readonly name = "kraken";

  async getSpotPrice(symbol: string): Promise<PriceResult> {
    const pair = KRAKEN_PAIR[symbol];
    if (!pair) throw new Error(`Kraken: unsupported ${symbol}`);
    const res = await fetch(
      `https://api.kraken.com/0/public/Ticker?pair=${pair}`
    );
    if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
    const data = (await res.json()) as {
      error: string[];
      result: Record<string, { c: [string, string] }>;
    };
    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(",")}`);
    const key = Object.keys(data.result)[0]!;
    const price = parseFloat(data.result[key]!.c[0]!);
    return {
      provider: this.name,
      symbol,
      price,
      timestamp: new Date().toISOString(),
    };
  }

  async getTwap(symbol: string, from: Date, to: Date): Promise<TwapResult> {
    const pair = KRAKEN_PAIR[symbol];
    if (!pair) throw new Error(`Kraken: unsupported ${symbol}`);
    // OHLC: [time, open, high, low, close, vwap, volume, count]
    const since = Math.floor(from.getTime() / 1000);
    const res = await fetch(
      `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=60&since=${since}`
    );
    if (!res.ok) throw new Error(`Kraken OHLC HTTP ${res.status}`);
    const data = (await res.json()) as {
      error: string[];
      result: Record<string, unknown>;
    };
    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(",")}`);
    const key = Object.keys(data.result).find((k) => k !== "last")!;
    const rows = data.result[key] as Array<
      [number, string, string, string, string, string, string, number]
    >;
    const endSec = Math.floor(to.getTime() / 1000);
    const inWindow = rows.filter((r) => r[0] >= since && r[0] <= endSec);
    if (!inWindow.length) throw new Error(`Kraken: no bars for ${symbol}`);
    // Prefer VWAP column
    const reps = inWindow.map((r) => parseFloat(r[5]!));
    const twap = reps.reduce((a, b) => a + b, 0) / reps.length;
    return {
      provider: this.name,
      symbol,
      twap,
      windowStart: from.toISOString(),
      windowEnd: to.toISOString(),
      barCount: inWindow.length,
    };
  }
}

export type PathAResolution =
  | {
      state: "resolved";
      resolutionPrice: number;
      twapA: number;
      twapB: number;
      spread: number;
      sources: string[];
      singleSource: boolean;
      outcome: boolean;
      resolvedAt: string;
    }
  | {
      state: "disputed";
      twapA: number;
      twapB: number;
      spread: number;
      sources: string[];
      resolvedAt: string;
    };

/**
 * Path A resolver. Uses config array of providers — DISPUTED activates when ≥2.
 * Single-source launch: skip spread check, flag singleSource.
 */
export async function resolvePathA(opts: {
  symbol: string;
  direction: "up" | "down";
  referencePrice: number;
  from: Date;
  to: Date;
  providers: MarketDataProvider[];
}): Promise<PathAResolution> {
  const { symbol, direction, referencePrice, from, to, providers } = opts;
  const results = await Promise.allSettled(
    providers.map((p) => p.getTwap(symbol, from, to))
  );
  const ok = results
    .filter((r): r is PromiseFulfilledResult<TwapResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (ok.length === 0) {
    throw new Error(`Path A: no sources for ${symbol}`);
  }

  if (ok.length === 1) {
    const twap = ok[0]!.twap;
    const outcome = twap > referencePrice === (direction === "up");
    return {
      state: "resolved",
      resolutionPrice: twap,
      twapA: twap,
      twapB: twap,
      spread: 0,
      sources: [ok[0]!.provider],
      singleSource: true,
      outcome,
      resolvedAt: new Date().toISOString(),
    };
  }

  const a = ok[0]!;
  const b = ok[1]!;
  const spread = Math.abs(a.twap - b.twap) / Math.min(a.twap, b.twap);
  const tolerance = PATH_A_TOLERANCE[symbol] ?? 0.001;

  if (spread > tolerance) {
    return {
      state: "disputed",
      twapA: a.twap,
      twapB: b.twap,
      spread,
      sources: [a.provider, b.provider],
      resolvedAt: new Date().toISOString(),
    };
  }

  const resolutionPrice = (a.twap + b.twap) / 2;
  const outcome = resolutionPrice > referencePrice === (direction === "up");
  return {
    state: "resolved",
    resolutionPrice,
    twapA: a.twap,
    twapB: b.twap,
    spread,
    sources: [a.provider, b.provider],
    singleSource: false,
    outcome,
    resolvedAt: new Date().toISOString(),
  };
}
