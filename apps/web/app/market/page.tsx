import { Suspense } from "react";
import MarketPage from "./MarketClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: "1rem", color: "var(--muted)" }}>Loading market…</div>}>
      <MarketPage />
    </Suspense>
  );
}
