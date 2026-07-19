import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createEmailClient,
  renderContactNotification,
} from "@app/email";

export const runtime = "nodejs";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  /** Honeypot — bots fill this; humans leave it empty. */
  company: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { company, ...payload } = parsed.data;
  if (company && company.trim().length > 0) {
    // Pretend success so bots don't retry differently.
    return NextResponse.json({ ok: true });
  }

  const to = process.env["CONTACT_TO_EMAIL"];
  if (!to) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "contact_missing_CONTACT_TO_EMAIL",
      })
    );
    return NextResponse.json(
      { error: "contact_not_configured" },
      { status: 503 }
    );
  }

  const body = renderContactNotification(payload);
  const client = createEmailClient();

  try {
    const result = await client.send({
      to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: payload.email,
      idempotencyKey: `contact:${payload.email}:${hashSubject(payload.subject, payload.message)}`,
      tags: { kind: "contact" },
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      id: result.id,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "contact_send_failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}

function hashSubject(subject: string, message: string): string {
  // Short non-crypto fingerprint for idempotency within a short window.
  let h = 0;
  const s = `${subject}\n${message}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
