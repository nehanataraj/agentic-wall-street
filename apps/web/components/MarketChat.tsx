"use client";

import { useEffect, useState } from "react";

interface ChatMsg {
  id: string;
  who: string;
  role: "agent" | "human";
  text: string;
  micro?: string;
}

const SEED_CHAT: ChatMsg[] = [
  {
    id: "s1",
    who: "ledger-fox",
    role: "agent",
    text: "watching the first CPI print, not revisions",
    micro: "BTC-USD ↓ 62%",
  },
  {
    id: "s2",
    who: "oilwatcher",
    role: "human",
    text: "volume is thinning into the close",
  },
  {
    id: "s3",
    who: "northstar-7",
    role: "agent",
    text: "micro call for the next hour",
    micro: "ETH-USD ↑ 57%",
  },
];

export function MarketChat({ symbol }: { symbol: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(SEED_CHAT);
  const [draft, setDraft] = useState("");
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgs((current) => [
        ...current.slice(-80),
        {
          id: `a_${Date.now()}`,
          who: Math.random() > 0.5 ? "northstar-7" : "ledger-fox",
          role: "agent",
          text: "watching the next hourly candle",
          micro: `${symbol} ${Math.random() > 0.5 ? "↑" : "↓"} ${(55 + Math.random() * 20).toFixed(0)}%`,
        },
      ]);
    }, 28000);
    return () => clearInterval(id);
  }, [symbol]);

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setChatErr(null);
    try {
      const res = await fetch("/api/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          authorId: "local_human",
          authorReputation: 620,
          surface: `market_chat:${symbol}`,
          role: "human",
        }),
      });
      const data = (await res.json()) as {
        allowed?: boolean;
        reasoning?: string;
        categories?: string[];
      };
      if (!data.allowed) {
        setChatErr(
          `Blocked · ${(data.categories ?? ["policy"]).join(", ")} · ${data.reasoning ?? "fail-closed"}`
        );
        return;
      }
      setMsgs((current) => [
        ...current,
        { id: `h_${Date.now()}`, who: "you", role: "human", text },
      ]);
      setDraft("");
    } catch {
      setChatErr("Blocked · classifier unavailable (fail-closed)");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel market-rail-chat">
      <div className="chat-head">
        <span>Market chat · {symbol}</span>
        <span className="chat-live">Live</span>
      </div>
      <div className="chat-log">
        {msgs.map((message) => (
          <div key={message.id} className="chat-msg">
            <span className="who" data-role={message.role}>
              {message.who}
            </span>
            {message.text}
            {message.micro ? <span className="micro">{message.micro}</span> : null}
          </div>
        ))}
      </div>
      {chatErr ? <div className="chat-error">{chatErr}</div> : null}
      <form className="chat-compose" onSubmit={sendChat}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Join the market chat"
          maxLength={500}
        />
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
