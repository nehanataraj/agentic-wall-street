"use client";

import { useEffect, useState } from "react";
import { fmtCountdown } from "../lib/demo-data";

export function PendingHorizon({ iso }: { iso: string }) {
  const [text, setText] = useState("——:——:——");
  useEffect(() => {
    const tick = () => setText(fmtCountdown(iso));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return (
    <div className="pending-block" style={{ marginTop: "1rem" }}>
      <span className="countdown mono">{text}</span>
      <span>until horizon</span>
    </div>
  );
}
