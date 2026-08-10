import { randomUUID } from "node:crypto";
import { fetchSpotPrices } from "./prices";
import { loadState, saveState } from "./store";
import { runStrategy } from "./strategies";
import { SIM_SYMBOLS, type AgentState, type PricePoint, type SimState, type SimSymbol, type Trade } from "./types";

const FEE_RATE = 0.0005; // 5 bps per fill — keeps trading from being "free"
const MIN_TRADE_NOTIONAL = 25; // skip dust trades under $25
const MAX_PRICE_HISTORY = 240;
const MAX_EQUITY_HISTORY = 500;
const MAX_TRADE_LOG = 400;

function currentEquity(agent: AgentState, prices: Record<SimSymbol, number>): number {
  let equity = agent.cash;
  for (const holding of Object.values(agent.holdings)) {
    const price = prices[holding.symbol as SimSymbol];
    if (price) equity += holding.quantity * price;
  }
  return equity;
}

function applyBuy(
  agent: AgentState,
  symbol: SimSymbol,
  fraction: number,
  price: number,
  equity: number,
  reason: string,
  now: string
): Trade | null {
  const rawNotional = Math.min(equity * fraction, agent.cash / (1 + FEE_RATE));
  if (rawNotional < MIN_TRADE_NOTIONAL) return null;

  const fee = rawNotional * FEE_RATE;
  const quantity = rawNotional / price;
  const existing = agent.holdings[symbol];
  const newQuantity = (existing?.quantity ?? 0) + quantity;
  const newAvgCost = existing
    ? (existing.avgCost * existing.quantity + rawNotional) / newQuantity
    : price;

  agent.cash -= rawNotional + fee;
  agent.holdings[symbol] = { symbol, quantity: newQuantity, avgCost: newAvgCost };

  return {
    id: randomUUID(),
    agentId: agent.id,
    symbol,
    side: "buy",
    quantity,
    price,
    fee,
    cashAfter: agent.cash,
    reason,
    executedAt: now,
  };
}

function applySell(
  agent: AgentState,
  symbol: SimSymbol,
  fraction: number,
  price: number,
  reason: string,
  now: string
): Trade | null {
  const holding = agent.holdings[symbol];
  if (!holding || holding.quantity <= 0) return null;

  const quantity = holding.quantity * Math.min(1, Math.max(0, fraction));
  const proceeds = quantity * price;
  if (proceeds < MIN_TRADE_NOTIONAL) return null;

  const fee = proceeds * FEE_RATE;
  agent.cash += proceeds - fee;
  const remaining = holding.quantity - quantity;
  if (remaining <= 1e-9) {
    delete agent.holdings[symbol];
  } else {
    agent.holdings[symbol] = { ...holding, quantity: remaining };
  }

  return {
    id: randomUUID(),
    agentId: agent.id,
    symbol,
    side: "sell",
    quantity,
    price,
    fee,
    cashAfter: agent.cash,
    reason,
    executedAt: now,
  };
}

let ticking = false;

export async function runTick(): Promise<SimState> {
  if (ticking) return loadState();
  ticking = true;
  try {
    const state = await loadState();
    const lastKnown: Partial<Record<SimSymbol, number>> = {};
    for (const symbol of SIM_SYMBOLS) {
      const history = state.priceHistory[symbol];
      if (history?.length) lastKnown[symbol] = history[history.length - 1]!.price;
    }

    const fetched = await fetchSpotPrices(lastKnown);
    const now = new Date().toISOString();
    const prices: Record<SimSymbol, number> = {} as Record<SimSymbol, number>;
    let missing = 0;
    for (const symbol of SIM_SYMBOLS) {
      const price = fetched[symbol];
      if (price === null) {
        missing++;
        continue;
      }
      prices[symbol] = price;
      const history = state.priceHistory[symbol] ?? [];
      history.push({ t: now, price });
      if (history.length > MAX_PRICE_HISTORY) history.shift();
      state.priceHistory[symbol] = history;
    }

    for (const agent of Object.values(state.agents)) {
      const equity = currentEquity(agent, prices);
      const decisions = runStrategy(agent.strategy, {
        agent,
        prices,
        priceHistory: state.priceHistory as Record<SimSymbol, PricePoint[]>,
        equity,
        tickCount: state.tickCount,
      });

      for (const decision of decisions) {
        const price = prices[decision.symbol];
        if (!price) continue;
        const liveEquity = currentEquity(agent, prices);
        const trade =
          decision.side === "buy"
            ? applyBuy(agent, decision.symbol, decision.fraction, price, liveEquity, decision.reason, now)
            : applySell(agent, decision.symbol, decision.fraction, price, decision.reason, now);
        if (trade) state.trades.push(trade);
      }

      const finalEquity = currentEquity(agent, prices);
      agent.equityHistory.push({ t: now, equity: finalEquity });
      if (agent.equityHistory.length > MAX_EQUITY_HISTORY) agent.equityHistory.shift();
    }

    if (state.trades.length > MAX_TRADE_LOG) {
      state.trades = state.trades.slice(-MAX_TRADE_LOG);
    }

    state.tickCount += 1;
    state.lastTickAt = now;
    state.lastError = missing === SIM_SYMBOLS.length ? "all price feeds unavailable this tick" : null;

    await saveState(state);
    return state;
  } catch (err) {
    const state = await loadState();
    state.lastError = err instanceof Error ? err.message : String(err);
    await saveState(state);
    return state;
  } finally {
    ticking = false;
  }
}
