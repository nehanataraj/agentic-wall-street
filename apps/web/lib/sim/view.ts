import { SIM_SYMBOLS } from "./types";
import type { AgentView, SimState, SimStateView, SimSymbol } from "./types";

export function buildView(state: SimState): SimStateView {
  const prices: Record<string, number> = {};
  for (const symbol of SIM_SYMBOLS) {
    const history = state.priceHistory[symbol];
    if (history?.length) prices[symbol] = history[history.length - 1]!.price;
  }

  const agents: AgentView[] = Object.values(state.agents)
    .map((agent) => {
      const holdings = Object.values(agent.holdings)
        .filter((h) => h.quantity > 1e-9)
        .map((h) => {
          const price = prices[h.symbol as SimSymbol] ?? h.avgCost;
          const value = h.quantity * price;
          return {
            ...h,
            price,
            value,
            unrealizedPnl: value - h.quantity * h.avgCost,
          };
        })
        .sort((a, b) => b.value - a.value);

      const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
      const equity = agent.cash + holdingsValue;
      const pnl = equity - state.startingCash;
      const pnlPct = (pnl / state.startingCash) * 100;

      return {
        id: agent.id,
        name: agent.name,
        strategy: agent.strategy,
        tagline: agent.tagline,
        cash: agent.cash,
        holdingsValue,
        equity,
        pnl,
        pnlPct,
        holdings,
        equityHistory: agent.equityHistory,
      };
    })
    .sort((a, b) => b.equity - a.equity);

  return {
    startingCash: state.startingCash,
    agents,
    trades: [...state.trades].reverse(),
    prices,
    tickCount: state.tickCount,
    lastTickAt: state.lastTickAt,
    lastError: state.lastError,
  };
}
