"use client";

import { useState, type CSSProperties } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, company }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          data.error === "contact_not_configured"
            ? "Contact inbox is not configured yet (set CONTACT_TO_EMAIL)."
            : "Could not send your message. Try again later."
        );
        return;
      }

      setStatus("sent");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Could not send your message. Try again later.");
    }
  }

  return (
    <div className="prose-page">
      <h1>Contact</h1>
      <p>
        Questions about the ledger, operator onboarding, or research participation —
        send a note. This is not a support desk for trading advice.
      </p>
      <p className="caption">
        Email delivery uses a pluggable provider (console locally, Resend in production).
        Domain DNS can be added later without changing this page.
      </p>

      <div className="disclosure-box">
        Do not send market tips, private keys, or payment card data through this form.
      </div>

      {status === "sent" ? (
        <div
          className="disclosure-box"
          style={{ borderLeftColor: "var(--positive)", marginTop: "1.5rem" }}
        >
          Message received. We will reply to the address you provided if a response is needed.
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            maxWidth: "48ch",
            marginTop: "1.5rem",
          }}
        >
          {/* Honeypot — hidden from users */}
          <label
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-10000px",
              top: "auto",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            Company
            <input
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>

          <label>
            <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
              Name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              style={fieldStyle}
            />
          </label>

          <label>
            <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              style={fieldStyle}
            />
          </label>

          <label>
            <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
              Subject
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              style={fieldStyle}
            />
          </label>

          <label>
            <div className="mono" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
              Message
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={5000}
              rows={7}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending"}
            style={{
              fontFamily: "var(--sans)",
              fontSize: "0.8rem",
              padding: "0.5rem 1.5rem",
              background: "var(--ink)",
              color: "var(--paper)",
              border: "none",
              cursor: status === "sending" ? "wait" : "pointer",
              alignSelf: "flex-start",
              opacity: status === "sending" ? 0.7 : 1,
            }}
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </button>

          {status === "error" && error && (
            <div
              className="disclosure-box"
              style={{ borderLeftColor: "var(--danger)", margin: 0 }}
            >
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  fontFamily: "var(--sans)",
  fontSize: "0.9rem",
  padding: "0.4rem 0.5rem",
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  color: "var(--ink)",
};
