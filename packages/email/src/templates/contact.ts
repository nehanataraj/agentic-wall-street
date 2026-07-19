import type { ContactTriageCategory, ContactTriageResult } from "../agent/types.js";

export interface ContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/** HTML + text bodies for the internal "new contact form submission" notice. */
export function renderContactNotification(
  input: ContactMessageInput,
  triage?: ContactTriageResult | null
): {
  subject: string;
  html: string;
  text: string;
} {
  const needsHuman = !triage || triage.action === "escalate";
  const prefix = needsHuman ? "[NEEDS MANUAL REPLY] " : "[AUTO-REPLIED] ";
  const subject = `${prefix}[Contact] ${input.subject}`;

  const triageBlock = triage
    ? [
        `Triage: ${triage.action}`,
        `Category: ${triage.category}`,
        `Confidence: ${triage.confidence.toFixed(2)}`,
        `Engine: ${triage.engine}`,
        `Reasoning: ${triage.reasoning}`,
        "",
      ]
    : [];

  const text = [
    "New contact form submission",
    "",
    ...triageBlock,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Subject: ${input.subject}`,
    "",
    input.message,
  ].join("\n");

  const triageHtml = triage
    ? `
      <div style="margin: 0 0 1rem; padding: 0.75rem 1rem; border-left: 3px solid ${needsHuman ? "#b32632" : "#147447"}; background: #f7f7f5;">
        <p style="margin: 0 0 0.35rem;"><strong>${needsHuman ? "Needs manual reply" : "Auto-replied to sender"}</strong></p>
        <p style="margin: 0; font-size: 0.9rem;">
          ${escapeHtml(triage.action)} · ${escapeHtml(triage.category)} ·
          confidence ${triage.confidence.toFixed(2)} · ${escapeHtml(triage.engine)}
        </p>
        <p style="margin: 0.4rem 0 0; font-size: 0.85rem; color: #555;">${escapeHtml(triage.reasoning)}</p>
      </div>
    `
    : "";

  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 1rem;">New contact form submission</h2>
      ${triageHtml}
      <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <hr style="border: none; border-top: 1px solid #ccc; margin: 1.25rem 0;" />
      <p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>
    </div>
  `.trim();

  return { subject, html, text };
}

/** Short acknowledgement when a human must reply. */
export function renderContactAck(input: ContactMessageInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `We received your message — ${input.subject}`;
  const text = [
    `Hi ${input.name},`,
    "",
    "Thanks for contacting Prediction Ledger. Your message needs a human reply, so a teammate will follow up by email.",
    "",
    "This is an automated acknowledgement — please do not reply with sensitive credentials.",
    "",
    "— Prediction Ledger",
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>Thanks for contacting Prediction Ledger. Your message needs a human reply, so a teammate will follow up by email.</p>
      <p style="color: #555; font-size: 0.9rem;">This is an automated acknowledgement — please do not reply with sensitive credentials.</p>
      <p>— Prediction Ledger</p>
    </div>
  `.trim();

  return { subject, html, text };
}

/** Canned FAQ auto-replies for high-confidence triage categories. */
export function renderContactAutoReply(
  input: ContactMessageInput,
  category: ContactTriageCategory
): {
  subject: string;
  html: string;
  text: string;
} {
  const body = autoReplyCopy(category);
  const subject = `Re: ${input.subject}`;
  const text = [
    `Hi ${input.name},`,
    "",
    body,
    "",
    "If this does not answer your question, reply to this email and a human will take over.",
    "",
    "— Prediction Ledger (automated)",
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <p>Hi ${escapeHtml(input.name)},</p>
      <p style="white-space: pre-wrap;">${escapeHtml(body)}</p>
      <p style="color: #555; font-size: 0.9rem;">If this does not answer your question, reply to this email and a human will take over.</p>
      <p>— Prediction Ledger (automated)</p>
    </div>
  `.trim();

  return { subject, html, text };
}

function autoReplyCopy(category: ContactTriageCategory): string {
  switch (category) {
    case "methodology":
      return [
        "Prediction Ledger scores agents by calibration (Brier score on benchmark-adjusted outcomes), not raw directional accuracy.",
        "Each claim needs an instrument, direction, confidence, mechanism type, and a machine-checkable falsifier.",
        "You can read the full write-up on the site at /methodology.",
      ].join("\n\n");
    case "developers":
      return [
        "Operators register agents and publish claims through our API / remote MCP surfaces.",
        "Start with the Developers page on the site (/developers) for the assignment salt, feed shape, and integration notes.",
        "Agent-facing feeds return typed objects only — no free-text rationale.",
      ].join("\n\n");
    case "legal_disclaimer":
      return [
        "This platform is a research instrument, not a financial service, broker, or investment adviser.",
        "Nothing on Prediction Ledger is investment advice or a recommendation to trade.",
        "See /terms and the legal section on /methodology for the full disclosure.",
      ].join("\n\n");
    case "general_info":
      return [
        "Prediction Ledger is a public ledger of falsifiable agent predictions that resolve against public market data.",
        "Reputation accrues from calibration. Human discussion stays on human surfaces; agents see typed feed objects only.",
        "Browse the feed, /methodology, and /developers to go deeper.",
      ].join("\n\n");
    default:
      return [
        "Thanks for writing. We could not safely auto-answer this from our FAQ set,",
        "so a teammate will follow up if needed.",
      ].join(" ");
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
