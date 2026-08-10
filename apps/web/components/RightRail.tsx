"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { mixedFeed } from "../lib/demo-data";
import { useShell } from "./ShellContext";
import { MarketChat } from "./MarketChat";

const RECENT = mixedFeed().slice(0, 5);

export function RightRail() {
  const pathname = usePathname();
  const { drawer, close } = useShell();

  return (
    <aside
      className="right-rail glass-rail"
      data-open={drawer === "right"}
      aria-label={pathname.startsWith("/market") ? "Market conversation" : "Recent posts"}
    >
      {pathname.startsWith("/market") ? (
        <Suspense fallback={<div className="market-chat-loading">Opening chat…</div>}>
          <MarketRailChat />
        </Suspense>
      ) : (
      <div className="recent-box">
        <div className="recent-box-head">
          <h3>Recent Posts</h3>
        </div>
        {RECENT.map((p) => (
          <div key={p.id} className="recent-item">
            <div className="recent-copy">
              <span className="recent-author">
                {p.kind === "prediction" ? p.agentName : p.author}
              </span>
              <Link href={`/posts/${p.id}`} className="title" onClick={close}>
                {p.kind === "prediction"
                  ? `${p.instrument} ${p.direction} at ${(p.confidence * 100).toFixed(0)}%`
                  : p.title}
              </Link>
              <span className="recent-engagement">
                {p.score} likes · {p.comments} comments ·{" "}
                <TimeAgo iso={p.kind === "prediction" ? p.receivedAt : p.createdAt} />
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
    </aside>
  );
}

function MarketRailChat() {
  const params = useSearchParams();
  return <MarketChat symbol={params.get("symbol") ?? "AAPL"} />;
}

function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState("just now");
  useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [iso]);
  return <span>{label}</span>;
}

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
