// ─── Scoring — §5 ─────────────────────────────────────────────────────────────
//
// Scoring rule: Brier score on confidence, evaluated against whether the
// instrument return beat its benchmark return (binary, benchmark-adjusted).
//
// beatBenchmark = instrumentReturn > benchmarkReturn
// brierScore    = (confidence - P(beatBenchmark))^2
//
// For a binary outcome, P(beatBenchmark) ∈ {0, 1}:
//   brierScore = (confidence - outcome)^2
//
// Lower Brier score is better. Overconfidence on the wrong side is actively
// costly — a 0.95 confidence claim that resolves false scores 0.9025,
// while a 0.55 confidence wrong claim scores only 0.3025.
//
// Aggregate reputation per (operator_id, config_hash):
//   - Mean Brier score over resolved claims
//   - Wilson confidence interval on mechanism_hit rate
//   - Mechanism matrix: {outcome, mechanism_hit} cell counts
//   - Display count and interval so low-count records rank below high-count ones

export interface ScoringInput {
  confidence: number; // (0.5, 1.0]
  direction: "up" | "down";
  instrumentReturn: number; // decimal, e.g. 0.023 = +2.3%
  benchmarkReturn: number;
}

export interface ScoringResult {
  beatBenchmark: boolean;
  outcome: boolean; // direction prediction was correct on raw price
  brierScore: number;
}

export function scoreResolution(input: ScoringInput): ScoringResult {
  const { confidence, direction, instrumentReturn, benchmarkReturn } = input;

  // Raw directional outcome
  const rawDirectionCorrect =
    direction === "up" ? instrumentReturn > 0 : instrumentReturn < 0;

  // Benchmark-adjusted binary outcome for ranking
  const beatBenchmark = instrumentReturn > benchmarkReturn;

  // Brier score uses beatBenchmark as the labeled outcome
  const p = beatBenchmark ? 1 : 0;
  const brierScore = Math.pow(confidence - p, 2);

  return {
    beatBenchmark,
    outcome: rawDirectionCorrect,
    brierScore: Math.round(brierScore * 1_000_000) / 1_000_000,
  };
}

// ─── Wilson confidence interval for a proportion ─────────────────────────────

export interface WilsonInterval {
  lower: number;
  upper: number;
  center: number;
  n: number;
}

/**
 * Wilson score interval for proportion p at 95% confidence (z = 1.96).
 * Used to display mechanism hit rate bands on the leaderboard.
 */
export function wilsonInterval(successes: number, n: number): WilsonInterval {
  if (n === 0) return { lower: 0, upper: 1, center: 0.5, n: 0 };
  const z = 1.96; // 95%
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    center,
    n,
  };
}

// ─── Mechanism matrix ─────────────────────────────────────────────────────────
// The four cells: outcome × mechanism_hit

export interface MechanismMatrix {
  skillCount: number;       // outcome=true, mechanismHit=true
  rightCallBadTradeCount: number; // outcome=true, mechanismHit=false
  luckCount: number;        // outcome=false, mechanismHit=true
  wrongCount: number;       // outcome=false, mechanismHit=false
  total: number;
}

export function buildMechanismMatrix(
  rows: Array<{ outcome: boolean; mechanismHit: boolean }>
): MechanismMatrix {
  let skill = 0, rightCallBadTrade = 0, luck = 0, wrong = 0;
  for (const r of rows) {
    if (r.outcome && r.mechanismHit) skill++;
    else if (r.outcome && !r.mechanismHit) rightCallBadTrade++;
    else if (!r.outcome && r.mechanismHit) luck++;
    else wrong++;
  }
  return {
    skillCount: skill,
    rightCallBadTradeCount: rightCallBadTrade,
    luckCount: luck,
    wrongCount: wrong,
    total: rows.length,
  };
}
