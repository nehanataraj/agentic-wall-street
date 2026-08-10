"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkline } from "../../components/Calibration";
import type { SimStateView } from "../../lib/sim/types";

const STRATEGY_LABEL: Record<string, string> = {
  momentum: "Momentum",
  "mean-reversion": "Mean reversion",
  rsi: "RSI swing",
  breakout: "Breakout",
  "steady-compounder": "Equal-weight control",
};

function currency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signed(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function DashboardClient() {
  const [state, setState] = useState<SimStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sim/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as SimStateView;
      if (mounted.current) {
        setState(data);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  const forceTick = useCallback(async () => {
    setForcing(true);
    try {
      const res = await fetch("/api/sim/tick", { method: "POST" });
      const data = (await res.json()) as SimStateView;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setForcing(false);
    }
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>Agent Trading Lab</h1>
        <p>
          Five autonomous bots, ${state ? state.startingCash.toLocaleString() : "10,000"} of synthetic
          money each. Every price is a live BTC/ETH/SOL/XRP quote; every trade, holding, and dollar
          here is simulated — none of it touches the prediction ledger or real funds.
        </p>
      </div>

      <div className="sim-status-bar glass-material">
        <div className="sim-status-item">
          <span>Tick</span>
          <strong className="mono">{state?.tickCount ?? "—"}</strong>
        </div>
        <div className="sim-status-item">
          <span>Last run</span>
          <strong className="mono">{timeAgo(state?.lastTickAt ?? null)}</strong>
        </div>
        <div className="sim-price-strip">
          {state &&
            Object.entries(state.prices).map(([symbol, price]) => (
              <span key={symbol} className="sim-price-chip mono">
                {symbol} <strong>{currency(price)}</strong>
              </span>
            ))}
        </div>
        <button className="sim-tick-btn" onClick={forceTick} disabled={forcing}>
          {forcing ? "Running…" : "Force tick"}
        </button>
      </div>

      {(error || state?.lastError) && (
        <div className="sim-error-banner">
          {error ? `Dashboard fetch error: ${error}` : `Engine warning: ${state?.lastError}`}
        </div>
      )}

      <div className="sim-agent-grid">
        {state?.agents.map((agent) => {
          const equitySeries = agent.equityHistory.map((p) => p.equity);
          const positive = agent.pnl >= 0;
          return (
            <div key={agent.id} className="sim-agent-card glass-material">
              <div className="sim-agent-head">
                <div>
                  <div className="sim-agent-name">{agent.name}</div>
                  <div className="sim-agent-strategy">{STRATEGY_LABEL[agent.strategy] ?? agent.strategy}</div>
                </div>
                {equitySeries.length > 1 && <Sparkline values={equitySeries} />}
              </div>

              <p className="sim-agent-tagline">{agent.tagline}</p>

              <div className="sim-agent-stats">
                <div>
                  <span>Equity</span>
                  <strong className="mono">{currency(agent.equity)}</strong>
                </div>
                <div>
                  <span>P&amp;L</span>
                  <strong className="mono" data-positive={positive}>
                    {signed(agent.pnl, 0) === "0" ? "$0" : `${positive ? "+" : ""}${currency(agent.pnl)}`} (
                    {signed(agent.pnlPct, 1)}%)
                  </strong>
                </div>
                <div>
                  <span>Cash</span>
                  <strong className="mono">{currency(agent.cash)}</strong>
                </div>
                <div>
                  <span>In market</span>
                  <strong className="mono">{currency(agent.holdingsValue)}</strong>
                </div>
              </div>

              <div className="sim-holdings">
                {agent.holdings.length === 0 ? (
                  <div className="sim-holdings-empty">All cash — no open positions</div>
                ) : (
                  <table className="sim-holdings-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Qty</th>
                        <th>Avg cost</th>
                        <th>Value</th>
                        <th>Unrealized</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agent.holdings.map((h) => (
                        <tr key={h.symbol}>
                          <td>{h.symbol}</td>
                          <td className="mono">{h.quantity.toFixed(5)}</td>
                          <td className="mono">{currency(h.avgCost)}</td>
                          <td className="mono">{currency(h.value)}</td>
                          <td className="mono" data-positive={h.unrealizedPnl >= 0}>
                            {h.unrealizedPnl >= 0 ? "+" : ""}
                            {currency(h.unrealizedPnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}
        {!state && <div className="sim-loading">Booting the trading lab…</div>}
      </div>

      <section className="sim-trade-feed">
        <div className="section-heading">Trade feed</div>
        {state && state.trades.length === 0 && (
          <div className="sim-holdings-empty" style={{ padding: "1rem" }}>
            No trades yet — the bots are still gathering price history.
          </div>
        )}
        <ul className="sim-trade-list">
          {state?.trades.slice(0, 60).map((trade) => {
            const agentName = state.agents.find((a) => a.id === trade.agentId)?.name ?? trade.agentId;
            return (
              <li key={trade.id} className="sim-trade-row">
                <span className="sim-trade-side" data-side={trade.side}>
                  {trade.side}
                </span>
                <span className="sim-trade-agent">{agentName}</span>
                <span className="sim-trade-symbol mono">{trade.symbol}</span>
                <span className="mono">
                  {trade.quantity.toFixed(5)} @ {currency(trade.price)}
                </span>
                <span className="sim-trade-reason">{trade.reason}</span>
                <span className="sim-trade-time mono">{timeAgo(trade.executedAt)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
