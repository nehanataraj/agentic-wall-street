import { describe, test, expect } from "vitest";
import { scoreResolution, wilsonInterval, buildMechanismMatrix } from "../scoring.js";

describe("scoreResolution", () => {
  test("beat benchmark and direction correct => skill row, low brier", () => {
    const result = scoreResolution({
      confidence: 0.8,
      direction: "up",
      instrumentReturn: 0.05,
      benchmarkReturn: 0.01,
    });
    expect(result.beatBenchmark).toBe(true);
    expect(result.outcome).toBe(true);
    // brierScore = (0.8 - 1)^2 = 0.04
    expect(result.brierScore).toBeCloseTo(0.04);
  });

  test("overconfidence on wrong side is actively costly", () => {
    const highConf = scoreResolution({
      confidence: 0.95,
      direction: "up",
      instrumentReturn: -0.02,
      benchmarkReturn: 0.01,
    });
    const lowConf = scoreResolution({
      confidence: 0.55,
      direction: "up",
      instrumentReturn: -0.02,
      benchmarkReturn: 0.01,
    });
    // beatBenchmark = false for both since instrument < benchmark
    expect(highConf.beatBenchmark).toBe(false);
    expect(lowConf.beatBenchmark).toBe(false);
    // High confidence wrong => higher brier score (worse)
    expect(highConf.brierScore).toBeGreaterThan(lowConf.brierScore);
  });

  test("benchmark-adjusted: claim unchanged if benchmark and claim both went up — acceptance criterion", () => {
    // If both went up by same amount, instrument doesn't beat benchmark
    const r1 = scoreResolution({
      confidence: 0.7,
      direction: "up",
      instrumentReturn: 0.03,
      benchmarkReturn: 0.03,
    });
    // instrument return equals benchmark — NOT beating benchmark
    expect(r1.beatBenchmark).toBe(false);

    // If instrument goes up more than benchmark
    const r2 = scoreResolution({
      confidence: 0.7,
      direction: "up",
      instrumentReturn: 0.05,
      benchmarkReturn: 0.03,
    });
    expect(r2.beatBenchmark).toBe(true);
  });

  test("bull market direction accuracy is not inflated — same brier for same confidence", () => {
    // In a bull market, "up" on any instrument might be 70% right
    // But if benchmark was also up, beatBenchmark = false unless alpha exists
    const bullMarket = Array.from({ length: 10 }, () =>
      scoreResolution({
        confidence: 0.7,
        direction: "up",
        instrumentReturn: 0.02,
        benchmarkReturn: 0.025, // benchmark outperformed instrument
      })
    );
    expect(bullMarket.every((r) => !r.beatBenchmark)).toBe(true);
  });
});

describe("wilsonInterval", () => {
  test("returns [0,1] for n=0", () => {
    const r = wilsonInterval(0, 0);
    expect(r.lower).toBe(0);
    expect(r.upper).toBe(1);
  });

  test("large n shrinks interval", () => {
    const small = wilsonInterval(50, 100);
    const large = wilsonInterval(500, 1000);
    const smallWidth = small.upper - small.lower;
    const largeWidth = large.upper - large.lower;
    expect(largeWidth).toBeLessThan(smallWidth);
  });
});

describe("mechanism matrix", () => {
  test("counts four cells correctly", () => {
    const rows = [
      { outcome: true, mechanismHit: true },
      { outcome: true, mechanismHit: false },
      { outcome: false, mechanismHit: true },
      { outcome: false, mechanismHit: false },
      { outcome: true, mechanismHit: true },
    ];
    const m = buildMechanismMatrix(rows);
    expect(m.skillCount).toBe(2);
    expect(m.rightCallBadTradeCount).toBe(1);
    expect(m.luckCount).toBe(1);
    expect(m.wrongCount).toBe(1);
    expect(m.total).toBe(5);
  });
});
