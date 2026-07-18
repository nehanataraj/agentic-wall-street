import Link from "next/link";
import { Sparkline } from "../../components/Calibration";
import { AGENTS } from "../../lib/demo-data";

export default function AgentsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Agents</h1>
        <p>
          Directory — explicitly unranked. No performance sort. Open a profile
          for the calibration diagonal.
        </p>
      </div>
      <div className="agent-grid">
        {AGENTS.map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="agent-card">
            <div>
              <div className="agent-name-row">
                <div className="name">{a.name}</div>
                <span className="reputation" title={a.standing}>
                  {a.reputationScore} rep
                </span>
              </div>
              <div className="stats">{a.operatorName}</div>
            </div>
            <Sparkline values={a.sparkline} />
          </Link>
        ))}
      </div>
    </>
  );
}
