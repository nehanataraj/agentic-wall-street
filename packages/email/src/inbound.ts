import { runEmailAgent } from "./graph/run.js";

/**
 * Parse Resend inbound / email.received style payloads and continue the thread.
 * Supports a few common shapes so local stubs and production webhooks both work.
 */
export async function handleInboundEmailWebhook(payload: unknown): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  result?: Awaited<ReturnType<typeof runEmailAgent>>;
}> {
  const parsed = normalizeInbound(payload);
  if (!parsed) {
    return { ok: true, skipped: true, reason: "unrecognized_payload" };
  }

  // Ignore our own outbound echoes if Resend ever mirrors them.
  if (parsed.from.toLowerCase().includes("onboarding@resend.dev")) {
    return { ok: true, skipped: true, reason: "skip_resend_system" };
  }

  const teamTo = process.env["CONTACT_TO_EMAIL"];
  if (teamTo && parsed.from.toLowerCase() === teamTo.toLowerCase()) {
    return { ok: true, skipped: true, reason: "skip_team_inbox" };
  }

  const result = await runEmailAgent({
    source: "inbound",
    name: parsed.name || parsed.from.split("@")[0] || "there",
    email: parsed.from,
    subject: parsed.subject,
    message: parsed.text,
    inReplyToProviderId: parsed.inReplyTo,
  });

  return { ok: true, result };
}

function normalizeInbound(payload: unknown): {
  from: string;
  name?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  // Resend webhook: { type, data: { email_id, from, subject, text, ... } }
  const type = typeof root["type"] === "string" ? root["type"] : "";
  const data =
    root["data"] && typeof root["data"] === "object"
      ? (root["data"] as Record<string, unknown>)
      : root;

  if (type && !/email\.(received|replied|inbound)/i.test(type) && type !== "email.received") {
    // Allow explicit test payloads without type
    if (!data["from"] && !data["sender"]) return null;
  }

  const fromRaw =
    (typeof data["from"] === "string" && data["from"]) ||
    (typeof data["sender"] === "string" && data["sender"]) ||
    "";
  const from = extractEmail(fromRaw);
  if (!from) return null;

  const subject =
    (typeof data["subject"] === "string" && data["subject"]) || "(no subject)";
  const text =
    (typeof data["text"] === "string" && data["text"]) ||
    (typeof data["html"] === "string" && stripHtml(data["html"])) ||
    (typeof data["body"] === "string" && data["body"]) ||
    "";

  if (!text.trim()) return null;

  const inReplyTo =
    (typeof data["in_reply_to"] === "string" && data["in_reply_to"]) ||
    (typeof data["inReplyTo"] === "string" && data["inReplyTo"]) ||
    (typeof data["email_id"] === "string" && data["email_id"]) ||
    (typeof data["reply_to_message_id"] === "string" && data["reply_to_message_id"]) ||
    undefined;

  const nameMatch = fromRaw.match(/^([^<]+)\s*</);
  const name = nameMatch?.[1]?.trim();

  return { from, name, subject, text, inReplyTo };
}

function extractEmail(value: string): string {
  const m = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (m?.[0] ?? value).trim().toLowerCase();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
