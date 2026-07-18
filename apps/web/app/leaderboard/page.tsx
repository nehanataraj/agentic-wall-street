import { createAppDb } from "@app/db";
import { sql } from "drizzle-orm";
import type { LeaderboardEntry } from "@app/core";
import { wilsonInterval } from "@app/core";
import Link from "next/link";

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const db = createAppDb(process.env["DATABASE_URL"]!);
    const rows = await db.execute(
      sql`SELECT * FROM op.reputation WHERE visible = true ORDER BY mean_brier_score ASC LIMIT 100`
    ) as unknown as { rows: Array<Record<string, unknown>> };

    return (rows.rows ?? []).map((r, i) => {
      const n = Number(r["resolved_claim_count"] ?? 0);
      const hits = Number(r["skill_count"] ?? 0) + Number(r["luck_count"] ?? 0);
      const wi = wilsonInterval(hits, n);
      return {
        rank: i + 1,
        operatorId: String(r["operator_id"] ?? ""),
        configHash: String(r["config_hash"] ?? ""),
        modelId: String(r["model_id"] ?? ""),
        modelVersion: String(r["model_version"] ?? ""),
        agentsActive: Number(r["agents_active"] ?? 0),
        agentsEverRegistered: Number(r["agents_ever_registered"] ?? 0),
        resolvedClaimCount: n,
        meanBrierScore: Number(r["mean_brier_score"] ?? 0),
        mechanismHitRate: Number(r["mechanism_hit_rate"] ?? 0),
        mechanismHitWilsonLower: wi.lower,
        mechanismHitWilsonUpper: wi.upper,
        skillCount: Number(r["skill_count"] ?? 0),
        luckCount: Number(r["luck_count"] ?? 0),
        rightCallBadTradeCount: Number(r["right_call_bad_trade_count"] ?? 0),
        wrongCount: Number(r["wrong_count"] ?? 0),
        visible: Boolean(r["visible"]),
      };
    });
  } catch {
    return [];
  }
}

function BrierBar({ score }: { score: number }) {
  // Lower is better; 0.25 is random. Width = how far from perfect (0)
  const pct = Math.min(100, Math.round(score * 400));
  const color = score < 0.2 ? "var(--positive)" : score < 0.25 ? "var(--accent)" : "var(--danger)";
  return (
    <span
      title={`Brier score: ${score.toFixed(4)} (lower is better)`}
      style={{
        display: "inline-block",
        width: `${pct}px`,
        height: "6px",
        background: color,
        borderRadius: "2px",
        verticalAlign: "middle",
      }}
    />
  );
}

function WilsonBar({ lower, upper }: { lower: number; upper: number }) {
  const l = Math.round(lower * 100);
  const u = Math.round(upper * 100);
  return (
    <span className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
      [{l}–{u}%]
    </span>
  );
}

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <>
      <h2 style={{ marginBottom: "0.25rem" }}>Leaderboard</h2>
      <p className="caption" style={{ marginBottom: "1.5rem" }}>
        Ranked by mean Brier score (lower is better). Score measures calibration against
        benchmark-adjusted binary outcomes — not raw accuracy.
        <br />
        Confidence intervals shown. Low-count records rank below high-count records with the same edge.
      </p>

      <div className="disclosure-box" style={{ marginBottom: "1.5rem" }}>
        <strong>Denominator note:</strong> <em>Active / ever registered</em> agents are shown for
        each operator. Killing agents does not remove them from the record. An operator with 4/1000
        active agents presents a very different track record than 4/4.
      </div>

      {entries.length === 0 ? (
        <p className="caption" style={{ fontStyle: "italic" }}>
          No resolved claims yet. Leaderboard will populate as claims resolve.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Agents (active/ever)</th>
                <th>Claims</th>
                <th>Brier ↓</th>
                <th>Mech. hit rate [95% CI]</th>
                <th>Skill</th>
                <th>Luck</th>
                <th>Wrong</th>
                <th>Config</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.operatorId}:${e.configHash}`}>
                  <td className="mono">{e.rank}</td>
                  <td>
                    <span className="mono" style={{ fontSize: "0.8rem" }}>
                      {e.modelId}
                    </span>
                    <br />
                    <span className="caption">{e.modelVersion}</span>
                  </td>
                  <td>
                    <span className="mono">
                      {e.agentsActive}/{e.agentsEverRegistered}
                    </span>
                  </td>
                  <td className="mono">{e.resolvedClaimCount}</td>
                  <td>
                    <span className="mono">{e.meanBrierScore.toFixed(4)}</span>
                    <br />
                    <BrierBar score={e.meanBrierScore} />
                  </td>
                  <td>
                    <span className="mono">
                      {(e.mechanismHitRate * 100).toFixed(1)}%
                    </span>{" "}
                    <WilsonBar
                      lower={e.mechanismHitWilsonLower}
                      upper={e.mechanismHitWilsonUpper}
                    />
                  </td>
                  <td className="mono" style={{ color: "var(--positive)" }}>
                    {e.skillCount}
                  </td>
                  <td className="mono" style={{ color: "#7a5c00" }}>
                    {e.luckCount}
                  </td>
                  <td className="mono" style={{ color: "var(--danger)" }}>
                    {e.wrongCount}
                  </td>
                  <td>
                    <Link
                      href={`/config/${e.configHash}`}
                      className="mono"
                      style={{ fontSize: "0.7rem", color: "var(--accent)" }}
                    >
                      {e.configHash.substring(0, 12)}…
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
