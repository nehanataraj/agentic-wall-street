import { createAppDb, configs, claims, resolutions, agents } from "@app/db";
import { eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ hash: string }>;
}

export default async function ConfigPage({ params }: Props) {
  const { hash } = await params;
  const db = createAppDb(process.env["DATABASE_URL"]!);

  const configRows = await db.select().from(configs).where(eq(configs.hash, hash));
  const config = configRows[0];
  if (!config) notFound();

  // Claims for this config
  const claimRows = await db
    .select({ claim: claims, resolution: resolutions })
    .from(claims)
    .leftJoin(resolutions, eq(claims.id, resolutions.claimId))
    .where(eq(claims.configHash, hash))
    .orderBy(sql`${claims.receivedAt} DESC`)
    .limit(100);

  const resolved = claimRows.filter((r) => r.resolution);
  const meanBrier =
    resolved.length > 0
      ? resolved.reduce((s, r) => s + parseFloat(r.resolution!.brierScore as string), 0) /
        resolved.length
      : null;

  return (
    <>
      <Link href="/leaderboard" style={{ fontSize: "0.8rem", color: "var(--muted)", textDecoration: "none" }}>
        ← Leaderboard
      </Link>
      <h2 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>Config Record</h2>
      <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{hash}</p>

      <div className="two-col" style={{ marginTop: "1.5rem" }}>
        <div>
          <h3 style={{ fontSize: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.25rem" }}>
            Config parameters
          </h3>
          <table style={{ fontSize: "0.875rem", borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr>
                <td style={{ padding: "0.3rem 0", color: "var(--muted)", width: "10rem" }}>Model ID</td>
                <td className="mono">{config.modelId}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.3rem 0", color: "var(--muted)" }}>Version</td>
                <td className="mono">{config.modelVersion}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.3rem 0", color: "var(--muted)" }}>First seen</td>
                <td className="mono">{new Date(config.firstSeenAt).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.3rem 0", color: "var(--muted)" }}>Tools</td>
                <td className="mono" style={{ fontSize: "0.75rem" }}>
                  {config.toolNames.join(", ") || "—"}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="disclosure-box" style={{ marginTop: "1rem" }}>
            <strong>System prompt is not displayed.</strong> It is stored in the ledger and covered
            by each claim&apos;s server countersignature, but it is not a public-facing field.
            Changing the prompt forks this record — claims under the old prompt retain their own
            track record.
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.25rem" }}>
            Performance summary
          </h3>
          <table style={{ fontSize: "0.875rem", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "0.3rem 0.5rem 0.3rem 0", color: "var(--muted)" }}>Total claims</td>
                <td className="mono">{claimRows.length}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.3rem 0.5rem 0.3rem 0", color: "var(--muted)" }}>Resolved</td>
                <td className="mono">{resolved.length}</td>
              </tr>
              {meanBrier !== null && (
                <tr>
                  <td style={{ padding: "0.3rem 0.5rem 0.3rem 0", color: "var(--muted)" }}>Mean Brier</td>
                  <td className="mono">{meanBrier.toFixed(4)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <hr className="rule" />
      <h3 style={{ fontSize: "1rem" }}>Claims under this config</h3>
      {claimRows.length === 0 ? (
        <p className="caption">No claims yet.</p>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Dir</th>
              <th>Conf</th>
              <th>Mechanism</th>
              <th>Horizon</th>
              <th>Exposure</th>
              <th>Outcome</th>
              <th>Brier</th>
            </tr>
          </thead>
          <tbody>
            {claimRows.map(({ claim, resolution }) => (
              <tr key={claim.id}>
                <td className="mono">{claim.instrument}</td>
                <td className={`mono direction-${claim.direction}`}>{claim.direction}</td>
                <td className="mono">{(parseFloat(claim.confidence as string) * 100).toFixed(0)}%</td>
                <td className="mono" style={{ fontSize: "0.75rem" }}>{claim.mechanismType}</td>
                <td className="mono" style={{ fontSize: "0.75rem" }}>
                  {new Date(claim.horizonEndsAt).toLocaleDateString()}
                </td>
                <td className="mono" style={{ fontSize: "0.75rem" }}>{claim.exposureState}</td>
                <td>
                  {resolution ? (
                    <span className={`badge ${resolution.outcome && resolution.mechanismHit ? "badge-skill" : !resolution.outcome && resolution.mechanismHit ? "badge-luck" : resolution.outcome ? "badge-luck" : "badge-wrong"}`}>
                      {resolution.outcome && resolution.mechanismHit ? "skill" :
                       !resolution.outcome && resolution.mechanismHit ? "luck" :
                       resolution.outcome ? "right/wrong mech" : "wrong"}
                    </span>
                  ) : (
                    <span className="badge badge-pending">pending</span>
                  )}
                </td>
                <td className="mono">
                  {resolution ? parseFloat(resolution.brierScore as string).toFixed(4) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
