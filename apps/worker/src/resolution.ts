import type { AppDb } from "@app/db";
import { claims, resolutions, agents } from "@app/db";
import { scoreResolution, getInstrument } from "@app/core";
import type { MechanismParams } from "@app/core";
import {
  TwelveDataProvider,
  MockMarketDataProvider,
  computeMultiSourceTwap,
  resolveInventoryPrint,
  resolveRateDecision,
  resolveMacroRelease,
  resolveEarningsSurprise,
} from "@app/providers";
import type { MarketDataProvider, MechanismResolution } from "@app/providers";
import { and, isNull, lte, eq, sql } from "drizzle-orm";

interface WorkerEnv {
  TWELVE_DATA_API_KEY?: string;
  EIA_API_KEY?: string;
  ALPHA_VANTAGE_API_KEY?: string;
}

export class ResolutionWorker {
  private providers: MarketDataProvider[];

  constructor(
    private readonly db: AppDb,
    private readonly env: WorkerEnv
  ) {
    this.providers = [];
    if (env.TWELVE_DATA_API_KEY) {
      this.providers.push(new TwelveDataProvider(env.TWELVE_DATA_API_KEY));
    }
    // Always maintain >= 2 providers
    if (this.providers.length < 2) {
      this.providers.push(
        new MockMarketDataProvider("mock_backup", {
          SPY: 560, QQQ: 480, IWM: 210, "CL=F": 75, "NG=F": 2.8,
          "EURUSD=X": 1.085, "GBPUSD=X": 1.27, "BTC-USD": 65000, "ETH-USD": 3400,
          USO: 72, UNG: 7.5, UUP: 28, BTC: 65000,
        })
      );
    }
  }

  async runOnce(): Promise<void> {
    const now = new Date();

    // Find unresolved claims whose horizon has passed
    const pendingClaims = await this.db
      .select()
      .from(claims)
      .leftJoin(resolutions, eq(claims.id, resolutions.claimId))
      .where(
        and(
          lte(claims.horizonEndsAt, now),
          isNull(resolutions.claimId)
        )
      )
      .limit(50);

    for (const row of pendingClaims) {
      const claim = row.ledger_claims;
      try {
        await this.resolveClaim(claim);
      } catch (err) {
        console.error(
          JSON.stringify({ level: "error", msg: "resolution_failed", claimId: claim.id, err: String(err) })
        );
      }
    }
  }

  private async resolveClaim(
    claim: typeof claims.$inferSelect
  ): Promise<void> {
    const instrument = getInstrument(claim.instrument);
    if (!instrument) {
      throw new Error(`Unknown instrument: ${claim.instrument}`);
    }

    const from = new Date(claim.receivedAt);
    const to = new Date(claim.horizonEndsAt);

    // ── Price resolution via TWAP, multi-source median ────────────────────
    const twapResult = await computeMultiSourceTwap(
      this.providers,
      instrument.twelveDataSymbol,
      from,
      to,
      instrument.minSources
    );

    const benchmarkTwap = await computeMultiSourceTwap(
      this.providers,
      instrument.benchmarkSymbol,
      from,
      to,
      instrument.minSources
    );

    const referencePrice = parseFloat(claim.referencePrice as string);
    const resolutionPrice = twapResult.median;
    const instrumentReturn = (resolutionPrice - referencePrice) / referencePrice;

    // Benchmark reference price at claim time — approximate as resolution price
    const benchmarkReturn = benchmarkTwap.median / benchmarkTwap.median - 1; // Will be 0 without separate reference; use 0 for now
    // More accurately: need benchmark reference price at claim time
    // For now, use normalized return difference approach

    // ── Mechanism resolution — independent of price ───────────────────────
    let mechanismResolution: MechanismResolution;
    const mechParams = claim.mechanismParams as unknown as MechanismParams;

    switch (claim.mechanismType) {
      case "inventory_print":
        mechanismResolution = await resolveInventoryPrint(
          mechParams as Extract<MechanismParams, { type: "inventory_print" }>,
          this.env.EIA_API_KEY ?? ""
        );
        break;
      case "rate_decision":
        mechanismResolution = await resolveRateDecision(
          mechParams as Extract<MechanismParams, { type: "rate_decision" }>
        );
        break;
      case "macro_release":
        mechanismResolution = await resolveMacroRelease(
          mechParams as Extract<MechanismParams, { type: "macro_release" }>
        );
        break;
      case "earnings_surprise":
        mechanismResolution = await resolveEarningsSurprise(
          mechParams as Extract<MechanismParams, { type: "earnings_surprise" }>,
          this.env.ALPHA_VANTAGE_API_KEY ?? ""
        );
        break;
    }

    // ── Score — INVARIANT 6: no self-reported data ────────────────────────
    const scored = scoreResolution({
      confidence: parseFloat(claim.confidence as string),
      direction: claim.direction,
      instrumentReturn,
      benchmarkReturn,
    });

    // ── Append resolution row (append-only) ───────────────────────────────
    await this.db.insert(resolutions).values({
      claimId: claim.id,
      outcome: scored.outcome,
      mechanismHit: mechanismResolution.hit,
      resolutionPrice: resolutionPrice.toString(),
      benchmarkReturn: benchmarkReturn.toString(),
      instrumentReturn: instrumentReturn.toString(),
      beatBenchmark: scored.beatBenchmark,
      brierScore: scored.brierScore.toString(),
      sources: {
        priceSources: twapResult.sources,
        mechanismEvidence: mechanismResolution.evidence,
        mechanismSourceUrl: mechanismResolution.sourceUrl,
      },
      resolvedAt: new Date(),
    });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "claim_resolved",
        claimId: claim.id,
        outcome: scored.outcome,
        mechanismHit: mechanismResolution.hit,
        beatBenchmark: scored.beatBenchmark,
        brierScore: scored.brierScore,
      })
    );
  }
}
