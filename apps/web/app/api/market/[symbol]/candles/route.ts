import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COINBASE: Record<string, string> = {
  "BTC-USD": "BTC-USD",
  "ETH-USD": "ETH-USD",
  "SOL-USD": "SOL-USD",
  "XRP-USD": "XRP-USD",
  "ADA-USD": "ADA-USD",
  "DOGE-USD": "DOGE-USD",
  "AVAX-USD": "AVAX-USD",
  "LINK-USD": "LINK-USD",
};

/**
 * Public chart series for Market page discovery.
 * Claim reference/resolution prices stay off public claim DTOs (§5).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z0-9.^:/-]{1,24}$/.test(symbol)) {
    return NextResponse.json({ error: "invalid_instrument" }, { status: 400 });
  }

  const url = new URL(req.url);
  const hours = Math.min(168, Number(url.searchParams.get("hours") ?? "48"));
  const end = Math.floor(Date.now() / 1000);
  const start = end - hours * 3600;
  try {
    const equity = COINBASE[symbol] === undefined;
    const candles = equity
      ? await fetchTwelveDataHourly(symbol, hours)
      : await fetchCoinbaseHourly(COINBASE[symbol]!, start, end);
    const firstOpen = candles[0]?.open;
    if (!firstOpen) throw new Error("market_data_empty");
    // Indexed OHLC preserves candle shape without redistributing raw exchange prices.
    const series = candles.map((c) => ({
      t: c.time,
      o: (c.open / firstOpen) * 100,
      h: (c.high / firstOpen) * 100,
      l: (c.low / firstOpen) * 100,
      c: (c.close / firstOpen) * 100,
    }));
    return NextResponse.json({
      symbol,
      source: equity ? "twelve_data" : "coinbase",
      singleSource: true,
      series,
    });
  } catch (err) {
    // Deterministic demo series if upstream fails
    const series = demoSeries(symbol, hours);
    return NextResponse.json({
      symbol,
      source: "demo",
      singleSource: true,
      series,
      warning: err instanceof Error ? err.message : "upstream_failed",
    });
  }
}

async function fetchTwelveDataHourly(
  symbol: string,
  hours: number
): Promise<Array<{ time: number; low: number; high: number; open: number; close: number; volume: number }>> {
  const apiKey = process.env["TWELVE_DATA_API_KEY"];
  if (!apiKey) throw new Error("twelve_data_key_missing");
  const outputsize = Math.min(Math.max(hours, 24), 168);
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1h&outputsize=${outputsize}&timezone=UTC&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`twelve_data_${res.status}`);
  const data = (await res.json()) as {
    values?: Array<{
      datetime: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume?: string;
    }>;
    message?: string;
  };
  if (!data.values?.length) {
    throw new Error(data.message ?? "twelve_data_empty");
  }
  return data.values
    .map((row) => ({
      time: Math.floor(new Date(`${row.datetime.replace(" ", "T")}Z`).getTime() / 1000),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    }))
    .filter((row) => [row.time, row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

async function fetchCoinbaseHourly(
  product: string,
  start: number,
  end: number
): Promise<Array<{ time: number; low: number; high: number; open: number; close: number; volume: number }>> {
  // Coinbase candles: [time, low, high, open, close, volume], granularity 3600
  const out: Array<{
    time: number;
    low: number;
    high: number;
    open: number;
    close: number;
    volume: number;
  }> = [];
  let cursor = start;
  while (cursor < end) {
    const chunkEnd = Math.min(cursor + 300 * 3600, end);
    const u =
      `https://api.exchange.coinbase.com/products/${product}/candles` +
      `?granularity=3600&start=${new Date(cursor * 1000).toISOString()}` +
      `&end=${new Date(chunkEnd * 1000).toISOString()}`;
    const res = await fetch(u, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`coinbase_${res.status}`);
    const rows = (await res.json()) as number[][];
    for (const r of rows) {
      out.push({
        time: r[0]!,
        low: r[1]!,
        high: r[2]!,
        open: r[3]!,
        close: r[4]!,
        volume: r[5]!,
      });
    }
    cursor = chunkEnd;
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function demoSeries(symbol: string, hours: number) {
  const n = Math.min(hours, 72);
  const now = Math.floor(Date.now() / 1000);
  const series = [];
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let close = 100;
  for (let i = n; i >= 0; i--) {
    const open = close;
    close = open + Math.sin((i + seed) / 4) * 0.22 + Math.cos((i + seed) / 9) * 0.11;
    const wick = 0.12 + Math.abs(Math.sin(i + seed)) * 0.2;
    series.push({
      t: now - i * 3600,
      o: open,
      h: Math.max(open, close) + wick,
      l: Math.min(open, close) - wick,
      c: close,
    });
  }
  return series;
}
