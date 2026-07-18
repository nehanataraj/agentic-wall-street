"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  INSTRUMENTS,
  fmtCountdown,
  PREDICTIONS,
} from "../../lib/demo-data";

interface CandlePoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  type: string;
}

export default function MarketClient() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("symbol") ?? "AAPL";
  const initialInstrument = INSTRUMENTS.find((item) => item.symbol === initial);
  const [symbol, setSymbol] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [selectedName, setSelectedName] = useState(
    initialInstrument?.name ?? initial
  );
  const [series, setSeries] = useState<CandlePoint[]>([]);
  const [source, setSource] = useState("—");
  const [loading, setLoading] = useState(false);
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const instrument =
    INSTRUMENTS.find((i) => i.symbol === symbol) ?? {
      symbol,
      name: selectedName,
      kind: "equity" as const,
      source: "Twelve Data",
      chg: 0,
    };
  const nextHorizon =
    PREDICTIONS.find((p) => p.instrument === symbol && p.status === "untested")
      ?.horizonAt ?? PREDICTIONS[0]!.horizonAt;

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/market/${encodeURIComponent(sym)}/candles?hours=48`
      );
      const data = (await res.json()) as {
        series?: CandlePoint[];
        source?: string;
      };
      setSeries(data.series ?? []);
      setSource(data.source ?? "unknown");
    } catch {
      setSeries([]);
      setSource("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = params.get("symbol") ?? "AAPL";
    if (requested !== symbol && /^[A-Z0-9.^:/-]{1,24}$/.test(requested)) {
      setSymbol(requested);
      setQuery(requested);
      setSelectedName(
        INSTRUMENTS.find((item) => item.symbol === requested)?.name ?? requested
      );
    }
  }, [params, symbol]);

  useEffect(() => {
    void load(symbol);
  }, [symbol, load]);

  useEffect(() => {
    const update = () => {
      const open = isUsMarketOpen(new Date());
      setMarketOpen(open);
      document.documentElement.dataset.marketClosed = open ? "false" : "true";
    };
    update();
    const id = setInterval(update, 60000);
    return () => {
      clearInterval(id);
      delete document.documentElement.dataset.marketClosed;
    };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text.toUpperCase() === symbol) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/market/search?q=${encodeURIComponent(text)}`,
          { signal: controller.signal }
        );
        const data = (await response.json()) as { results?: SearchResult[] };
        setMatches((data.results ?? []).slice(0, 8));
      } catch {
        if (!controller.signal.aborted) setMatches([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query, symbol]);

  function selectSymbol(next: string, name?: string) {
    setSymbol(next);
    setQuery(next);
    setSelectedName(
      name ?? INSTRUMENTS.find((item) => item.symbol === next)?.name ?? next
    );
    setMatches([]);
    router.replace(`/market?symbol=${encodeURIComponent(next)}`, { scroll: false });
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    const hit = INSTRUMENTS.find(
      (i) =>
        i.symbol === q ||
        i.symbol.replace("-", "") === q.replace("-", "") ||
        i.name.toUpperCase().includes(q)
    );
    if (hit) {
      selectSymbol(hit.symbol);
    } else if (matches[0]) {
      selectSymbol(matches[0].symbol, matches[0].name);
    } else if (/^[A-Z0-9.^:/-]{1,24}$/.test(q)) {
      selectSymbol(q);
    } else {
      setQuery(symbol);
    }
  }

  return (
    <div className="market-panel">
      <div className="market-search-wrap">
        <label htmlFor="mkt-search">Search all publicly listed companies</label>
        <form className="market-search-row" onSubmit={onSearch}>
          <input
            id="mkt-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="AAPL, NVDA, BTC-USD…"
            autoComplete="off"
          />
          <button type="submit">Chart</button>
        </form>
        {searching ? <div className="market-searching">Searching listings…</div> : null}
        {matches.length ? (
          <div className="market-search-results">
            {matches.map((match) => (
              <button
                key={`${match.symbol}-${match.exchange}`}
                type="button"
                onClick={() => selectSymbol(match.symbol, match.name)}
              >
                <strong>{match.symbol}</strong>
                <span>{match.name}</span>
                <small>{match.exchange} · {match.country}</small>
              </button>
            ))}
          </div>
        ) : null}
        <span className="popular-label">Popular</span>
        <div className="chip-row">
          {INSTRUMENTS.map((i) => (
            <button
              key={i.symbol}
              type="button"
              className="chip"
              data-active={i.symbol === symbol}
              onClick={() => selectSymbol(i.symbol)}
            >
              {i.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-panel">
        <div className="chart-head">
          <div>
            <h1>
              <span className="mono">{instrument.symbol}</span>
            </h1>
            <div className="sub">
              {instrument.name} · {instrument.kind === "equity" ? "US equity" : "crypto"} ·{" "}
              {loading ? "loading…" : `source ${source}`}
            </div>
          </div>
          {instrument.kind === "equity" ? (
            <div className="market-hours-card" data-open={marketOpen === true}>
              <span className="market-hours-dot" aria-hidden />
              <div>
                <strong>US market {marketOpen ? "open" : "closed"}</strong>
                <span>New York trading hours</span>
              </div>
            </div>
          ) : (
            <div className="countdown-pill">
              <span className="val"><LiveCd iso={nextHorizon} /></span>
              <span className="countdown-caption">until verified</span>
            </div>
          )}
        </div>
        <CandlestickChart series={series} symbol={symbol} />
        <p className="chart-note">
          Hourly OHLC indexed to 100 at the window open. Candle shape is public;
          claim reference and resolution prices remain internal.
        </p>
      </div>

    </div>
  );
}

function LiveCd({ iso }: { iso: string }) {
  const [t, setT] = useState("——:——:——");
  useEffect(() => {
    const tick = () => setT(fmtCountdown(iso));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{t}</>;
}

function CandlestickChart({
  series,
  symbol,
}: {
  series: CandlePoint[];
  symbol: string;
}) {
  const candles = series.slice(-48);
  const width = 700;
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 38, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  if (candles.length === 0) {
    return <div className="chart-empty">Waiting for market candles…</div>;
  }

  const low = Math.min(...candles.map((candle) => candle.l));
  const high = Math.max(...candles.map((candle) => candle.h));
  const padding = Math.max((high - low) * 0.08, 0.08);
  const min = low - padding;
  const max = high + padding;
  const range = max - min || 1;
  const toY = (value: number) =>
    margin.top + ((max - value) / range) * plotHeight;
  const slot = plotWidth / candles.length;
  const bodyWidth = Math.max(2.5, Math.min(8, slot * 0.62));
  const yTicks = Array.from({ length: 5 }, (_, index) => ({
    value: max - (range * index) / 4,
    y: margin.top + (plotHeight * index) / 4,
  }));
  const xIndexes = Array.from(
    new Set([0, Math.floor(candles.length / 3), Math.floor((candles.length * 2) / 3), candles.length - 1])
  );

  return (
    <svg
      className="chart-svg candlestick-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${symbol} indexed hourly candlestick chart`}
    >
      <title>{symbol} indexed hourly OHLC candles</title>
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={tick.y}
            y2={tick.y}
            className="chart-grid-line"
          />
          <text
            x={margin.left - 8}
            y={tick.y}
            textAnchor="end"
            dominantBaseline="middle"
            className="chart-axis-label"
          >
            {tick.value.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="chart-axis-line"
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="chart-axis-line"
      />
      {candles.map((candle, index) => {
        const x = margin.left + slot * index + slot / 2;
        const rising = candle.c >= candle.o;
        const openY = toY(candle.o);
        const closeY = toY(candle.c);
        return (
          <g
            key={`${candle.t}-${index}`}
            className={rising ? "candle-up" : "candle-down"}
          >
            <line x1={x} x2={x} y1={toY(candle.h)} y2={toY(candle.l)} />
            <rect
              x={x - bodyWidth / 2}
              y={Math.min(openY, closeY)}
              width={bodyWidth}
              height={Math.max(1.4, Math.abs(closeY - openY))}
            />
          </g>
        );
      })}
      {xIndexes.map((index) => {
        const candle = candles[index]!;
        const x = margin.left + slot * index + slot / 2;
        return (
          <text
            key={candle.t}
            x={x}
            y={height - 14}
            textAnchor={index === 0 ? "start" : index === candles.length - 1 ? "end" : "middle"}
            className="chart-axis-label"
          >
            {formatAxisTime(candle.t)}
          </text>
        );
      })}
      <text
        x={12}
        y={margin.top + plotHeight / 2}
        transform={`rotate(-90 12 ${margin.top + plotHeight / 2})`}
        textAnchor="middle"
        className="chart-axis-title"
      >
        Indexed value
      </text>
    </svg>
  );
}

function formatAxisTime(unix: number): string {
  const date = new Date(unix * 1000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${month}/${day} ${hour}:00`;
}

function isUsMarketOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const weekday = part("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
