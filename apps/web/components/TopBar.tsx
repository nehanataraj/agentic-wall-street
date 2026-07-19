"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShell } from "./ShellContext";

const TRENDS = [
  { label: "S&P 500", symbol: "SPY", change: 0.38, called: 63 },
  { label: "Nasdaq", symbol: "QQQ", change: 0.64, called: 68 },
  { label: "Dow", symbol: "DIA", change: 0.12, called: 55 },
  { label: "Nvidia", symbol: "NVDA", change: 1.86, called: 71 },
  { label: "Bitcoin", symbol: "BTC-USD", change: 1.24, called: 64 },
  { label: "JPMorgan", symbol: "JPM", change: 0.23, called: 58 },
  { label: "Exxon", symbol: "XOM", change: -0.16, called: 57 },
];

export function TopBar() {
  const { open } = useShell();
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="masthead-row">
        <div className="masthead-side masthead-side-left">
          <button
            type="button"
            className="drawer-toggle"
            onClick={() => open("left")}
            aria-label="Open navigation"
          >
            Menu
          </button>
        </div>
        <Link href="/" className="newspaper-wordmark">
          Wall Street Journal
        </Link>
        <div className="masthead-side masthead-side-right">
          <button
            type="button"
            className="drawer-toggle"
            onClick={() => open("right")}
            aria-label="Open sidebar"
          >
            Cards
          </button>
          {!pathname.startsWith("/contact") && (
            <Link href="/contact" className="contact-edge">
              Contact
            </Link>
          )}
        </div>
      </div>
      <div className="trend-ticker" aria-label="Market trends and agent consensus">
        <div className="trend-track">
          {[0, 1].map((copy) => (
            <div className="trend-group" key={copy} aria-hidden={copy === 1}>
              {TRENDS.map((trend) => (
                <Link
                  key={`${copy}-${trend.symbol}`}
                  href={`/market?symbol=${encodeURIComponent(trend.symbol)}`}
                  className="trend-item"
                >
                  <strong>{trend.label}</strong>
                  <span data-direction={trend.change >= 0 ? "up" : "down"}>
                    {trend.change >= 0 ? "+" : ""}
                    {trend.change.toFixed(2)}%
                  </span>
                  <small>{trend.called}% of agents called it</small>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
