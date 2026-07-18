// ─── Market data provider interface ──────────────────────────────────────────
// All providers implement this interface. TWAP is computed over minute bars.
// A minimum of 2 independent providers is required for resolution.

export interface PriceBar {
  time: string; // ISO 8601
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceResult {
  provider: string;
  symbol: string;
  price: number; // spot price
  timestamp: string;
}

export interface TwapResult {
  provider: string;
  symbol: string;
  twap: number;
  windowStart: string;
  windowEnd: string;
  barCount: number;
}

export interface MarketDataProvider {
  name: string;
  getSpotPrice(symbol: string): Promise<PriceResult>;
  getTwap(symbol: string, from: Date, to: Date): Promise<TwapResult>;
}

// ─── Multi-source TWAP computation ───────────────────────────────────────────
// Compute TWAP from each provider independently, then take the median.
// Requires >= minSources valid results. Returns null if insufficient sources.

export interface MultiSourceTwap {
  median: number;
  sources: Array<{
    provider: string;
    twap: number;
    barCount: number;
  }>;
  resolvedAt: string;
}

export async function computeMultiSourceTwap(
  providers: MarketDataProvider[],
  symbol: string,
  from: Date,
  to: Date,
  minSources: number
): Promise<MultiSourceTwap> {
  const results = await Promise.allSettled(
    providers.map((p) => p.getTwap(symbol, from, to))
  );

  const successful = results
    .filter((r): r is PromiseFulfilledResult<TwapResult> => r.status === "fulfilled")
    .map((r) => r.value);

  if (successful.length < minSources) {
    throw new Error(
      `Insufficient price sources: got ${successful.length}, need ${minSources} for ${symbol}`
    );
  }

  const sorted = [...successful].sort((a, b) => a.twap - b.twap);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]!.twap
      : (sorted[mid - 1]!.twap + sorted[mid]!.twap) / 2;

  return {
    median,
    sources: successful.map((r) => ({
      provider: r.provider,
      twap: r.twap,
      barCount: r.barCount,
    })),
    resolvedAt: new Date().toISOString(),
  };
}

// ─── Twelve Data provider ─────────────────────────────────────────────────────

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "twelve_data";

  constructor(private readonly apiKey: string) {}

  async getSpotPrice(symbol: string): Promise<PriceResult> {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
    const data = (await res.json()) as { price?: string; message?: string };
    if (!data.price) throw new Error(`TwelveData: ${data.message ?? "no price"}`);
    return {
      provider: this.name,
      symbol,
      price: parseFloat(data.price),
      timestamp: new Date().toISOString(),
    };
  }

  async getTwap(symbol: string, from: Date, to: Date): Promise<TwapResult> {
    const start = from.toISOString().replace("T", " ").substring(0, 19);
    const end = to.toISOString().replace("T", " ").substring(0, 19);
    const url =
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
      `&interval=1min&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}` +
      `&apikey=${this.apiKey}&outputsize=5000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);
    const data = (await res.json()) as {
      values?: Array<{ close: string; datetime: string }>;
      message?: string;
    };
    if (!data.values?.length) throw new Error(`TwelveData: no bars for ${symbol}`);
    const closes = data.values.map((v) => parseFloat(v.close));
    const twap = closes.reduce((a, b) => a + b, 0) / closes.length;
    return {
      provider: this.name,
      symbol,
      twap,
      windowStart: from.toISOString(),
      windowEnd: to.toISOString(),
      barCount: closes.length,
    };
  }
}

// ─── Mock provider for testing ────────────────────────────────────────────────

export class MockMarketDataProvider implements MarketDataProvider {
  constructor(
    readonly name: string,
    private readonly priceMap: Record<string, number>
  ) {}

  async getSpotPrice(symbol: string): Promise<PriceResult> {
    const price = this.priceMap[symbol];
    if (price === undefined) throw new Error(`MockProvider: unknown symbol ${symbol}`);
    return { provider: this.name, symbol, price, timestamp: new Date().toISOString() };
  }

  async getTwap(symbol: string): Promise<TwapResult> {
    const price = this.priceMap[symbol];
    if (price === undefined) throw new Error(`MockProvider: unknown symbol ${symbol}`);
    return {
      provider: this.name,
      symbol,
      twap: price,
      windowStart: new Date().toISOString(),
      windowEnd: new Date().toISOString(),
      barCount: 60,
    };
  }
}
