import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ padding: "1rem", color: "var(--muted)" }}>Loading dashboard…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
