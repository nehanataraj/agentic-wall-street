// ─── Liquid instrument allowlist — INVARIANT 5 / §5 ─────────────────────────
// Default deny. Adding an instrument requires explicit justification of depth.
// Manipulation works on microcaps; it does not work on these instruments.

export interface InstrumentSpec {
  symbol: string;
  displayName: string;
  benchmarkSymbol: string;
  category: "etf" | "futures" | "fx" | "crypto";
  // Provider symbol mappings
  twelveDataSymbol: string;
  // Minimum required price sources
  minSources: number;
}

export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  SPY: {
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF",
    benchmarkSymbol: "SPY",
    category: "etf",
    twelveDataSymbol: "SPY",
    minSources: 2,
  },
  QQQ: {
    symbol: "QQQ",
    displayName: "Invesco QQQ Trust",
    benchmarkSymbol: "SPY",
    category: "etf",
    twelveDataSymbol: "QQQ",
    minSources: 2,
  },
  IWM: {
    symbol: "IWM",
    displayName: "iShares Russell 2000 ETF",
    benchmarkSymbol: "SPY",
    category: "etf",
    twelveDataSymbol: "IWM",
    minSources: 2,
  },
  "CL=F": {
    symbol: "CL=F",
    displayName: "Crude Oil WTI Front Month",
    benchmarkSymbol: "USO",
    category: "futures",
    twelveDataSymbol: "CL1!",
    minSources: 2,
  },
  "NG=F": {
    symbol: "NG=F",
    displayName: "Natural Gas Front Month",
    benchmarkSymbol: "UNG",
    category: "futures",
    twelveDataSymbol: "NG1!",
    minSources: 2,
  },
  "EURUSD=X": {
    symbol: "EURUSD=X",
    displayName: "EUR/USD",
    benchmarkSymbol: "UUP",
    category: "fx",
    twelveDataSymbol: "EUR/USD",
    minSources: 2,
  },
  "GBPUSD=X": {
    symbol: "GBPUSD=X",
    displayName: "GBP/USD",
    benchmarkSymbol: "UUP",
    category: "fx",
    twelveDataSymbol: "GBP/USD",
    minSources: 2,
  },
  "BTC-USD": {
    symbol: "BTC-USD",
    displayName: "Bitcoin / USD",
    benchmarkSymbol: "BTC-USD",
    category: "crypto",
    twelveDataSymbol: "BTC/USD",
    minSources: 2,
  },
  "ETH-USD": {
    symbol: "ETH-USD",
    displayName: "Ethereum / USD",
    benchmarkSymbol: "BTC-USD",
    category: "crypto",
    twelveDataSymbol: "ETH/USD",
    minSources: 2,
  },
};

export function isAllowedInstrument(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(INSTRUMENTS, symbol);
}

export function getInstrument(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS[symbol];
}
