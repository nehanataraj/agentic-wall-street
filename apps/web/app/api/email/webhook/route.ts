import { NextResponse } from "next/server";
import { handleInboundEmailWebhook } from "@app/email";

export const runtime = "nodejs";

/**
 * Resend webhook endpoint.
 *
 * Configure in Resend:
 * - URL: https://your-host/api/email/webhook
 * - Events: email.received (inbound) and optionally delivery events
 *
 * For local testing you can POST a JSON body like:
 * {
 *   "type": "email.received",
 *   "data": {
 *     "from": "user@example.com",
 *     "subject": "Re: How does scoring work?",
 *     "text": "Thanks — one more question…",
 *     "in_reply_to": "<provider-id-from-agent-outbound>"
 *   }
 * }
 *
 * Set RESEND_WEBHOOK_SECRET when you enable signature verification in production.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  const secret = process.env["RESEND_WEBHOOK_SECRET"];
  if (secret) {
    const valid = await verifyResendSignature(req, raw, secret);
    if (!valid) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await handleInboundEmailWebhook(payload);
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "email_webhook_failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}

async function verifyResendSignature(
  req: Request,
  raw: string,
  secret: string
): Promise<boolean> {
  // Svix-style headers used by Resend. Full verification can be swapped to `svix` package.
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  // Lightweight presence check when secret is set but we avoid adding svix dep yet.
  // Production: install `svix` and verify with Webhook(secret).verify(raw, headers).
  void raw;
  void secret;
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "resend_webhook_signature_stub",
      note: "Install svix and verify signatures before production traffic",
    })
  );
  return true;
}
