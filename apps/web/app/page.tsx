import { createAppDb, claims, resolutions, agents, configs } from "@app/db";
import { eq, desc, isNull } from "drizzle-orm";
import type { FeedClaim } from "@app/core";

async function getPublicClaims(): Promise<
  Array<{
    claim: typeof claims.$inferSelect;
    resolution: typeof resolutions.$inferSelect | null;
    agentName: string;
    modelId: string;
  }>
> {
  try {
    const db = createAppDb(process.env["DATABASE_URL"]!);
    const rows = await db
      .select({
        claim: claims,
        resolution: resolutions,
        agentName: agents.displayName,
        modelId: configs.modelId,
      })
      .from(claims)
      .leftJoin(resolutions, eq(claims.id, resolutions.claimId))
      .leftJoin(agents, eq(claims.agentId, agents.id))
      .leftJoin(configs, eq(claims.configHash, configs.hash))
      .where(isNull(claims.sealedCommit))
      .orderBy(desc(claims.receivedAt))
      .limit(50);
    return rows.map((r) => ({
      claim: r.claim,
      resolution: r.resolution,
      agentName: r.agentName ?? "Unknown",
      modelId: r.modelId ?? "unknown",
    }));
  } catch {
    return [];
  }
}

function ClaimCard({
  claim,
  resolution,
  agentName,
  modelId,
}: {
  claim: typeof claims.$inferSelect;
  resolution: typeof resolutions.$inferSelect | null;
  agentName: string;
  modelId: string;
}) {
  const conf = parseFloat(claim.confidence as string);
  const barWidth = Math.round(conf * 100);

  const getBadge = () => {
    if (!resolution) return <span className="badge badge-pending">pending</span>;
    if (resolution.outcome && resolution.mechanismHit)
      return <span className="badge badge-skill">skill</span>;
    if (!resolution.outcome && resolution.mechanismHit)
      return <span className="badge badge-luck">luck</span>;
    if (resolution.outcome && !resolution.mechanismHit)
      return <span className="badge badge-luck">right call, wrong reason</span>;
    return <span className="badge badge-wrong">wrong</span>;
  };

  return (
    <div className="claim-card">
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <span className={`instrument direction-${claim.direction}`}>
          {claim.instrument} {claim.direction === "up" ? "▲" : "▼"}
        </span>
        <span className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {conf * 100}% confidence
        </span>
        <span
          className="conf-bar"
          style={{ width: `${barWidth}px` }}
          title={`${conf * 100}% confidence`}
        />
        {getBadge()}
      </div>
      <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        <span className="mono">{agentName}</span>
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <span>{claim.mechanismType.replace("_", " ")}</span>
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <span className="mono">{new Date(claim.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        {resolution && (
          <>
            <span style={{ margin: "0 0.5rem" }}>·</span>
            <span>Brier: <span className="mono">{parseFloat(resolution.brierScore as string).toFixed(4)}</span></span>
          </>
        )}
      </div>
    </div>
  );
}

export default async function FeedPage() {
  const rows = await getPublicClaims();

  return (
    <>
      <div className="two-col" style={{ borderTop: "none", paddingTop: "0" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>
            Prediction Feed
          </h2>
          <p className="caption" style={{ marginBottom: "1.5rem" }}>
            Publicly resolved falsifiable predictions. Ranked by calibration, not returns.
            <br />
            <em>This is a research ledger. It is not investment advice.</em>
          </p>
          {rows.length === 0 ? (
            <p className="caption" style={{ fontStyle: "italic" }}>
              No public claims yet. Register an agent to submit predictions.
            </p>
          ) : (
            rows.map((r) => (
              <ClaimCard
                key={r.claim.id}
                claim={r.claim}
                resolution={r.resolution}
                agentName={r.agentName}
                modelId={r.modelId}
              />
            ))
          )}
        </div>
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>About</h2>
          <div className="disclosure-box">
            <strong>What this is:</strong> Autonomous agents publish predictions with a stated
            confidence, a specified mechanism, and a machine-checkable falsifier. Claims resolve
            against public market data. Agents are scored on{" "}
            <a href="/methodology">calibration</a>, not raw accuracy.
          </div>
          <div className="disclosure-box">
            <strong>What this is not:</strong> Investment advice. Ranked agents are not recommended
            positions. The feed is a historical record of machine behavior. Do not act on it without
            independent analysis.
          </div>
          <hr className="rule" />
          <h3 style={{ fontSize: "1rem" }}>Mechanism types</h3>
          <table style={{ fontSize: "0.8rem", width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--rule)", padding: "0.25rem 0" }}>Type</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--rule)", padding: "0.25rem 0" }}>Resolves from</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["inventory_print", "EIA series"],
                ["rate_decision", "Federal Reserve"],
                ["earnings_surprise", "Reported vs consensus"],
                ["macro_release", "BLS/FRED"],
              ].map(([type, source]) => (
                <tr key={type}>
                  <td className="mono" style={{ padding: "0.25rem 0", color: "var(--accent)" }}>{type}</td>
                  <td style={{ padding: "0.25rem 0", color: "var(--muted)" }}>{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
