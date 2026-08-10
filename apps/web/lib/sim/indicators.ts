import type { PricePoint } from "./types";

export function sma(points: PricePoint[], period: number): number | null {
  if (points.length < period) return null;
  const window = points.slice(-period);
  return window.reduce((sum, p) => sum + p.price, 0) / window.length;
}

export function stddev(points: PricePoint[], period: number): number | null {
  if (points.length < period) return null;
  const window = points.slice(-period);
  const mean = window.reduce((sum, p) => sum + p.price, 0) / window.length;
  const variance =
    window.reduce((sum, p) => sum + (p.price - mean) ** 2, 0) / window.length;
  return Math.sqrt(variance);
}

/** Wilder's RSI over the trailing `period` price changes. */
export function rsi(points: PricePoint[], period = 14): number | null {
  if (points.length < period + 1) return null;
  const window = points.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < window.length; i++) {
    const change = window[i]!.price - window[i - 1]!.price;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** % change from `period` ticks ago to the latest tick. */
export function pctChange(points: PricePoint[], period: number): number | null {
  if (points.length < period + 1) return null;
  const past = points[points.length - 1 - period]!.price;
  const latest = points[points.length - 1]!.price;
  if (past <= 0) return null;
  return (latest - past) / past;
}
