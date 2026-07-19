import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailClient, handleContactSubmission } from "@app/email";

export const runtime = "nodejs";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
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
    return NextResponse.json({ ok: true });
  }

  const to = process.env["CONTACT_TO_EMAIL"];
  if (!to) {
    return NextResponse.json(
      { error: "contact_not_configured" },
      { status: 503 }
    );
  }

  try {
    const result = await handleContactSubmission({
      ...payload,
      teamTo: to,
      client: createEmailClient(),
    });

    return NextResponse.json({
      ok: true,
      provider: result.team.provider,
      id: result.team.id,
      threadId: result.threadId,
      runId: result.runId,
      triage: result.triage
        ? {
            action: result.triage.action,
            category: result.triage.category,
            confidence: result.triage.confidence,
          }
        : null,
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
