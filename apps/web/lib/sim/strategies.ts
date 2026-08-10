import { pctChange, rsi, sma, stddev } from "./indicators";
import { SIM_SYMBOLS, type AgentState, type PricePoint, type SimSymbol, type StrategyId } from "./types";

export interface StrategyContext {
  agent: AgentState;
  prices: Record<SimSymbol, number>;
  priceHistory: Record<SimSymbol, PricePoint[]>;
  equity: number;
  tickCount: number;
}

export interface Decision {
  symbol: SimSymbol;
  side: "buy" | "sell";
  /** Buy: fraction of total equity to spend. Sell: fraction of held quantity to close. */
  fraction: number;
  reason: string;
}

const MAX_POSITION_FRACTION = 0.3; // don't let one symbol exceed 30% of equity
const BUY_FRACTION = 0.2; // spend 20% of equity per buy signal

function heldValueFraction(ctx: StrategyContext, symbol: SimSymbol): number {
  const holding = ctx.agent.holdings[symbol];
  if (!holding || ctx.equity <= 0) return 0;
  return (holding.quantity * ctx.prices[symbol]) / ctx.equity;
}

function heldQty(ctx: StrategyContext, symbol: SimSymbol): number {
  return ctx.agent.holdings[symbol]?.quantity ?? 0;
}

// ─── Momentum: buy strength, sell weakness ──────────────────────────────────
function momentum(ctx: StrategyContext): Decision[] {
  const decisions: Decision[] = [];
  for (const symbol of SIM_SYMBOLS) {
    const change = pctChange(ctx.priceHistory[symbol] ?? [], 5);
    if (change === null) continue;
    if (change > 0.004 && heldValueFraction(ctx, symbol) < MAX_POSITION_FRACTION) {
      decisions.push({
        symbol,
        side: "buy",
        fraction: BUY_FRACTION,
        reason: `+${(change * 100).toFixed(2)}% over 5 ticks — riding momentum`,
      });
    } else if (change < -0.004 && heldQty(ctx, symbol) > 0) {
      decisions.push({
        symbol,
        side: "sell",
        fraction: 1,
        reason: `${(change * 100).toFixed(2)}% over 5 ticks — momentum broke, exiting`,
      });
    }
  }
  return decisions;
}

// ─── Mean reversion: buy dips vs. moving average, sell pops ─────────────────
function meanReversion(ctx: StrategyContext): Decision[] {
  const decisions: Decision[] = [];
  for (const symbol of SIM_SYMBOLS) {
    const history = ctx.priceHistory[symbol] ?? [];
    const avg = sma(history, 10);
    const price = ctx.prices[symbol];
    if (avg === null || !price) continue;
    const deviation = (price - avg) / avg;
    if (deviation < -0.006 && heldValueFraction(ctx, symbol) < MAX_POSITION_FRACTION) {
      decisions.push({
        symbol,
        side: "buy",
        fraction: BUY_FRACTION,
        reason: `${(deviation * 100).toFixed(2)}% below 10-tick average — buying the dip`,
      });
    } else if (deviation > 0.008 && heldQty(ctx, symbol) > 0) {
      decisions.push({
        symbol,
        side: "sell",
        fraction: 1,
        reason: `${(deviation * 100).toFixed(2)}% above 10-tick average — taking profit`,
      });
    }
  }
  return decisions;
}

// ─── RSI: classic oversold / overbought ─────────────────────────────────────
function rsiStrategy(ctx: StrategyContext): Decision[] {
  const decisions: Decision[] = [];
  for (const symbol of SIM_SYMBOLS) {
    const value = rsi(ctx.priceHistory[symbol] ?? [], 10);
    if (value === null) continue;
    if (value < 35 && heldValueFraction(ctx, symbol) < MAX_POSITION_FRACTION) {
      decisions.push({
        symbol,
        side: "buy",
        fraction: BUY_FRACTION,
        reason: `RSI ${value.toFixed(1)} — oversold`,
      });
    } else if (value > 65 && heldQty(ctx, symbol) > 0) {
      decisions.push({
        symbol,
        side: "sell",
        fraction: 1,
        reason: `RSI ${value.toFixed(1)} — overbought`,
      });
    }
  }
  return decisions;
}

// ─── Breakout: Bollinger-band breakout to the upside, exit on mean-fade ─────
function breakout(ctx: StrategyContext): Decision[] {
  const decisions: Decision[] = [];
  for (const symbol of SIM_SYMBOLS) {
    const history = ctx.priceHistory[symbol] ?? [];
    const avg = sma(history, 10);
    const sd = stddev(history, 10);
    const price = ctx.prices[symbol];
    if (avg === null || sd === null || !price) continue;
    const upperBand = avg + 1.5 * sd;
    if (price > upperBand && heldValueFraction(ctx, symbol) < MAX_POSITION_FRACTION) {
      decisions.push({
        symbol,
        side: "buy",
        fraction: BUY_FRACTION,
        reason: `broke above upper band (${upperBand.toFixed(2)}) — breakout entry`,
      });
    } else if (price < avg && heldQty(ctx, symbol) > 0) {
      decisions.push({
        symbol,
        side: "sell",
        fraction: 1,
        reason: `fell back below 10-tick average — breakout faded`,
      });
    }
  }
  return decisions;
}

// ─── Steady compounder: periodic equal-weight rebalance across all symbols ──
// The control strategy: no signal-chasing, just dollar-cost-average into an
// equal-weight basket and rebalance back to target on a fixed schedule.
function steadyCompounder(ctx: StrategyContext): Decision[] {
  const REBALANCE_EVERY = 6;
  if (ctx.tickCount % REBALANCE_EVERY !== 0) return [];
  const targetFraction = 1 / SIM_SYMBOLS.length;
  const decisions: Decision[] = [];
  for (const symbol of SIM_SYMBOLS) {
    const price = ctx.prices[symbol];
    if (!price) continue;
    const currentFraction = heldValueFraction(ctx, symbol);
    if (currentFraction < targetFraction - 0.03) {
      decisions.push({
        symbol,
        side: "buy",
        fraction: targetFraction - currentFraction,
        reason: `scheduled rebalance — topping up to equal weight`,
      });
    } else if (currentFraction > targetFraction + 0.05) {
      const excess = currentFraction - targetFraction;
      decisions.push({
        symbol,
        side: "sell",
        fraction: Math.min(1, excess / currentFraction),
        reason: `scheduled rebalance — trimming back to equal weight`,
      });
    }
  }
  return decisions;
}

const STRATEGIES: Record<StrategyId, (ctx: StrategyContext) => Decision[]> = {
  momentum,
  "mean-reversion": meanReversion,
  rsi: rsiStrategy,
  breakout,
  "steady-compounder": steadyCompounder,
};

export function runStrategy(strategy: StrategyId, ctx: StrategyContext): Decision[] {
  return STRATEGIES[strategy](ctx);
}
