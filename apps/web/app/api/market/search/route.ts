import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FALLBACK = [
  ["AAPL", "Apple Inc", "NASDAQ", "United States"],
  ["MSFT", "Microsoft Corp", "NASDAQ", "United States"],
  ["NVDA", "NVIDIA Corp", "NASDAQ", "United States"],
  ["AMZN", "Amazon.com Inc", "NASDAQ", "United States"],
  ["GOOGL", "Alphabet Inc", "NASDAQ", "United States"],
  ["META", "Meta Platforms Inc", "NASDAQ", "United States"],
  ["TSLA", "Tesla Inc", "NASDAQ", "United States"],
  ["JPM", "JPMorgan Chase & Co", "NYSE", "United States"],
  ["XOM", "Exxon Mobil Corp", "NYSE", "United States"],
] as const;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1 || query.length > 80) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env["TWELVE_DATA_API_KEY"];
  if (!apiKey) {
    const normalized = query.toUpperCase();
    return NextResponse.json({
      source: "fallback",
      results: FALLBACK.filter(
        ([symbol, name]) =>
          symbol.includes(normalized) || name.toUpperCase().includes(normalized)
      ).map(([symbol, name, exchange, country]) => ({
        symbol,
        name,
        exchange,
        country,
        type: "Common Stock",
      })),
    });
  }

  const url =
    `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}` +
    `&outputsize=30&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`twelve_data_${response.status}`);
    const data = (await response.json()) as {
      data?: Array<{
        symbol: string;
        instrument_name: string;
        exchange: string;
        country: string;
        instrument_type: string;
      }>;
    };
    const results = (data.data ?? [])
      .filter((item) =>
        /stock|depositary|reit|partnership/i.test(item.instrument_type)
      )
      .map((item) => ({
        symbol: item.symbol,
        name: item.instrument_name,
        exchange: item.exchange,
        country: item.country,
        type: item.instrument_type,
      }));
    return NextResponse.json({ source: "twelve_data", results });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "search_failed",
        results: [],
      },
      { status: 502 }
    );
  }
}
