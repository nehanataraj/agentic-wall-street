import type { MechanismParams } from "@app/core";

// ─── Mechanism resolvers ──────────────────────────────────────────────────────
// Each resolver answers: did this mechanism actually occur?
// Resolution is independent of price — this is the whole point.
// All data comes from public sources; no self-reported inputs.

export interface MechanismResolution {
  hit: boolean;
  evidence: Record<string, unknown>;
  sourceUrl: string;
  resolvedAt: string;
}

// ─── inventory_print — EIA weekly petroleum/gas data ─────────────────────────

export async function resolveInventoryPrint(
  params: Extract<MechanismParams, { type: "inventory_print" }>,
  eiaApiKey: string
): Promise<MechanismResolution> {
  const url = `https://api.eia.gov/v2/seriesid/${encodeURIComponent(params.series)}?api_key=${eiaApiKey}&length=2&sort[0][column]=period&sort[0][direction]=desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA API HTTP ${res.status}`);
  const data = (await res.json()) as {
    response?: { data?: Array<{ period: string; value: string }> };
  };
  const rows = data.response?.data;
  if (!rows || rows.length < 2) throw new Error("EIA: insufficient data");

  const latest = parseFloat(rows[0]!.value);
  const prior = parseFloat(rows[1]!.value);
  const change = latest - prior;

  let hit: boolean;
  switch (params.comparator) {
    case "gt":  hit = change > params.threshold; break;
    case "lt":  hit = change < params.threshold; break;
    case "gte": hit = change >= params.threshold; break;
    case "lte": hit = change <= params.threshold; break;
  }

  return {
    hit,
    evidence: { series: params.series, change, latest, prior, threshold: params.threshold, comparator: params.comparator },
    sourceUrl: url.replace(eiaApiKey, "REDACTED"),
    resolvedAt: new Date().toISOString(),
  };
}

// ─── rate_decision — Federal Reserve FOMC statements ─────────────────────────

export async function resolveRateDecision(
  params: Extract<MechanismParams, { type: "rate_decision" }>
): Promise<MechanismResolution> {
  // FRED effective federal funds rate (daily)
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS&vintage_date=${params.meetingDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").filter((l) => !l.startsWith("DATE"));
  const last = lines[lines.length - 1];
  if (!last) throw new Error("FRED: no data");
  const [, rateStr] = last.split(",");
  const rate = parseFloat(rateStr ?? "");
  if (isNaN(rate)) throw new Error("FRED: could not parse rate");

  const hit = rate >= params.targetRangeMin && rate <= params.targetRangeMax;

  return {
    hit,
    evidence: { rate, targetRangeMin: params.targetRangeMin, targetRangeMax: params.targetRangeMax },
    sourceUrl: url,
    resolvedAt: new Date().toISOString(),
  };
}

// ─── macro_release — BLS/FRED public data ────────────────────────────────────

export async function resolveMacroRelease(
  params: Extract<MechanismParams, { type: "macro_release" }>
): Promise<MechanismResolution> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(params.series)}&vintage_date=${new Date().toISOString().substring(0, 10)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").filter((l) => !l.startsWith("DATE"));
  const last = lines[lines.length - 1];
  if (!last) throw new Error("FRED: no data");
  const [, valStr] = last.split(",");
  const value = parseFloat(valStr ?? "");
  if (isNaN(value)) throw new Error("FRED: could not parse value");

  let hit: boolean;
  switch (params.comparator) {
    case "gt":  hit = value > params.threshold; break;
    case "lt":  hit = value < params.threshold; break;
    case "gte": hit = value >= params.threshold; break;
    case "lte": hit = value <= params.threshold; break;
  }

  return {
    hit,
    evidence: { series: params.series, value, threshold: params.threshold, comparator: params.comparator },
    sourceUrl: url,
    resolvedAt: new Date().toISOString(),
  };
}

// ─── earnings_surprise — reported vs consensus ────────────────────────────────
// Uses Alpha Vantage earnings endpoint (public quarterly data).

export async function resolveEarningsSurprise(
  params: Extract<MechanismParams, { type: "earnings_surprise" }>,
  alphaVantageKey: string
): Promise<MechanismResolution> {
  const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(params.ticker)}&apikey=${alphaVantageKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const data = (await res.json()) as {
    quarterlyEarnings?: Array<{
      reportedEPS?: string;
      estimatedEPS?: string;
      reportedDate?: string;
      totalRevenue?: string;
      estimatedRevenue?: string;
    }>;
  };
  const latest = data.quarterlyEarnings?.[0];
  if (!latest) throw new Error("Alpha Vantage: no earnings data");

  let hit: boolean;
  let evidence: Record<string, unknown>;

  if (params.metric === "eps") {
    const reported = parseFloat(latest.reportedEPS ?? "");
    const estimated = parseFloat(latest.estimatedEPS ?? "");
    if (isNaN(reported) || isNaN(estimated)) throw new Error("AV: invalid EPS data");
    const surprise = reported - estimated;
    hit =
      params.vsConsensus === "beat" ? surprise > 0 :
      params.vsConsensus === "miss" ? surprise < 0 :
      Math.abs(surprise) < 0.01;
    evidence = { metric: "eps", reported, estimated, surprise };
  } else {
    const reported = parseFloat(latest.totalRevenue ?? "");
    const estimated = parseFloat(latest.estimatedRevenue ?? "");
    if (isNaN(reported) || isNaN(estimated)) throw new Error("AV: invalid revenue data");
    const surprisePct = (reported - estimated) / Math.abs(estimated);
    hit =
      params.vsConsensus === "beat" ? surprisePct > 0 :
      params.vsConsensus === "miss" ? surprisePct < 0 :
      Math.abs(surprisePct) < 0.001;
    evidence = { metric: "revenue", reported, estimated, surprisePct };
  }

  return {
    hit,
    evidence,
    sourceUrl: url.replace(alphaVantageKey, "REDACTED"),
    resolvedAt: new Date().toISOString(),
  };
}
