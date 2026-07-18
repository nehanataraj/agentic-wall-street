"use client";

import { useState } from "react";

export default function VerifyPage() {
  const [claimId, setClaimId] = useState("");
  const [root, setRoot] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [result, setResult] = useState<{ valid?: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ root, proof: proofJson });
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_BASE_URL"]}/v1/merkle/verify/${encodeURIComponent(claimId)}?${params}`
      );
      const data = await res.json() as { valid?: boolean; error?: string };
      setResult(data);
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="prose-page">
      <h1>Verify a Claim</h1>
      <p>
        Enter a claim ID, a published Merkle root (from{" "}
        <a href={`${process.env["NEXT_PUBLIC_API_BASE_URL"]}/v1/merkle/roots`} target="_blank" rel="noreferrer">
          published roots
        </a>
        ), and the proof path returned when the claim was submitted.
      </p>
      <p className="caption">
        Verification is independent. You do not need to trust this server — anyone can verify
        using the published root and the proof path.
      </p>

      <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "48ch" }}>
        <label>
          <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>Claim ID (UUID)</div>
          <input
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ width: "100%", fontFamily: "Courier Prime, monospace", fontSize: "0.85rem", padding: "0.4rem 0.5rem", border: "1px solid var(--rule)" }}
            required
          />
        </label>
        <label>
          <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>Merkle Root (hex)</div>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="64 hex characters"
            style={{ width: "100%", fontFamily: "Courier Prime, monospace", fontSize: "0.85rem", padding: "0.4rem 0.5rem", border: "1px solid var(--rule)" }}
            required
          />
        </label>
        <label>
          <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>Proof (JSON array)</div>
          <textarea
            value={proofJson}
            onChange={(e) => setProofJson(e.target.value)}
            rows={5}
            placeholder='[{"sibling":"abc...","position":"right"},...]'
            style={{ width: "100%", fontFamily: "Courier Prime, monospace", fontSize: "0.75rem", padding: "0.4rem 0.5rem", border: "1px solid var(--rule)" }}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            fontFamily: "var(--sans)",
            fontSize: "0.8rem",
            padding: "0.5rem 1.5rem",
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>

      {result && (
        <div
          className="disclosure-box"
          style={{
            marginTop: "1.5rem",
            borderLeftColor: result.valid ? "var(--positive)" : "var(--danger)",
          }}
        >
          {result.valid ? (
            <>
              <strong style={{ color: "var(--positive)" }}>✓ Valid</strong>
              <p style={{ margin: "0.25rem 0 0" }}>
                This claim was included in the Merkle tree with the specified root and has not been
                altered.
              </p>
            </>
          ) : (
            <>
              <strong style={{ color: "var(--danger)" }}>✗ Invalid</strong>
              <p style={{ margin: "0.25rem 0 0" }}>
                {result.error ?? "Proof does not match the given root."}
              </p>
            </>
          )}
        </div>
      )}

      <hr className="rule" />
      <h3>Published roots</h3>
      <p className="caption">
        Daily Merkle roots are published publicly. Each root covers all claims received through
        that day.
      </p>
      <a
        href={`${process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000"}/v1/merkle/roots`}
        target="_blank"
        rel="noreferrer"
        className="mono"
        style={{ fontSize: "0.85rem", color: "var(--accent)" }}
      >
        GET /v1/merkle/roots →
      </a>
    </div>
  );
}
