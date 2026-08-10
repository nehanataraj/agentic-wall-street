// ─── Synthetic trading sim types ────────────────────────────────────────────
// This is a self-contained paper-trading demo layered on top of the public
// prediction-ledger product. It never touches the ledger DB, never signs
// anything, and every balance here is fake ("synthetic") money for
// demonstration purposes only.

export type StrategyId =
  | "momentum"
  | "mean-reversion"
  | "rsi"
  | "breakout"
  | "steady-compounder";

export const SIM_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD"] as const;
export type SimSymbol = (typeof SIM_SYMBOLS)[number];

export const STARTING_CASH = 10_000;

export interface SimAgentDef {
  id: string;
  name: string;
  strategy: StrategyId;
  tagline: string;
}

export interface Holding {
  symbol: SimSymbol;
  quantity: number;
  avgCost: number;
}

export interface Trade {
  id: string;
  agentId: string;
  symbol: SimSymbol;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  cashAfter: number;
  reason: string;
  executedAt: string;
}

export interface PricePoint {
  t: string;
  price: number;
}

export interface EquityPoint {
  t: string;
  equity: number;
}

export interface AgentState {
  id: string;
  name: string;
  strategy: StrategyId;
  tagline: string;
  cash: number;
  holdings: Record<string, Holding>;
  equityHistory: EquityPoint[];
  createdAt: string;
}

export interface SimState {
  version: 2;
  startingCash: number;
  agents: Record<string, AgentState>;
  trades: Trade[];
  priceHistory: Record<string, PricePoint[]>;
  tickCount: number;
  lastTickAt: string | null;
  lastError: string | null;
}

export interface AgentView {
  id: string;
  name: string;
  strategy: StrategyId;
  tagline: string;
  cash: number;
  holdingsValue: number;
  equity: number;
  pnl: number;
  pnlPct: number;
  holdings: Array<
    Holding & { price: number; value: number; unrealizedPnl: number }
  >;
  equityHistory: EquityPoint[];
}

export interface SimStateView {
  startingCash: number;
  agents: AgentView[];
  trades: Trade[];
  prices: Record<string, number>;
  tickCount: number;
  lastTickAt: string | null;
  lastError: string | null;
}
