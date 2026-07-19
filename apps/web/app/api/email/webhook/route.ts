import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Resend webhook stub.
 *
 * Later:
 * 1. Resend Dashboard → Webhooks → endpoint = https://your.domain/api/email/webhook
 * 2. Subscribe to email.delivered / email.bounced / email.complained
 * 3. Verify the Svix signature (Resend docs) then persist events
 *
 * Until then this route acknowledges the contract without side effects.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  console.info(
    JSON.stringify({
      level: "info",
      msg: "email_webhook_stub",
      bytes: raw.length,
      note: "Wire Resend signature verification + delivery tracking here",
    })
  );
  return NextResponse.json({ ok: true, status: "stub" });
}
