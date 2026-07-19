import { eq } from "drizzle-orm";
import {
  createAppDb,
  emailAgentRuns,
  emailMessages,
  emailThreads,
  type AppDb,
} from "@app/db";
import type { EmailAgentAction, EmailAgentSource } from "./graph/state.js";

export type EmailDb = AppDb;

export function getEmailDb(): EmailDb {
  return createAppDb();
}

export async function createEmailThread(
  db: EmailDb,
  input: {
    contactEmail: string;
    contactName?: string;
    subject: string;
  }
) {
  const [row] = await db
    .insert(emailThreads)
    .values({
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      subject: input.subject,
      status: "open",
    })
    .returning();
  if (!row) throw new Error("failed to create email thread");
  return row;
}

export async function findThreadByOutboundProviderId(
  db: EmailDb,
  providerId: string
) {
  const rows = await db
    .select()
    .from(emailThreads)
    .where(eq(emailThreads.lastOutboundProviderId, providerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findThreadById(db: EmailDb, id: string) {
  const rows = await db
    .select()
    .from(emailThreads)
    .where(eq(emailThreads.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findOpenThreadByEmailAndSubject(
  db: EmailDb,
  contactEmail: string,
  subject: string
) {
  const normalized = subject.replace(/^(re|fwd):\s*/i, "").trim().toLowerCase();
  const rows = await db.select().from(emailThreads);
  return (
    rows.find(
      (t) =>
        t.contactEmail.toLowerCase() === contactEmail.toLowerCase() &&
        t.subject.replace(/^(re|fwd):\s*/i, "").trim().toLowerCase() === normalized &&
        (t.status === "open" || t.status === "auto_replied" || t.status === "needs_human")
    ) ?? null
  );
}

export async function insertAgentRun(
  db: EmailDb,
  input: {
    threadId: string;
    source: EmailAgentSource;
    model?: string;
    action: EmailAgentAction;
    category?: string;
    confidence?: number;
    reasoning?: string;
    draftSubject?: string;
    draftBody?: string;
    kbVersion?: string;
    hardRuleHit?: string;
    teamProviderId?: string;
    userProviderId?: string;
  }
) {
  const [row] = await db
    .insert(emailAgentRuns)
    .values({
      threadId: input.threadId,
      source: input.source,
      model: input.model,
      action: input.action,
      category: input.category,
      confidence: input.confidence !== undefined ? String(input.confidence) : null,
      reasoning: input.reasoning,
      draftSubject: input.draftSubject,
      draftBody: input.draftBody,
      kbVersion: input.kbVersion,
      hardRuleHit: input.hardRuleHit,
      teamProviderId: input.teamProviderId,
      userProviderId: input.userProviderId,
    })
    .returning();
  if (!row) throw new Error("failed to insert email agent run");
  return row;
}

export async function insertEmailMessage(
  db: EmailDb,
  input: {
    threadId: string;
    runId?: string;
    direction:
      | "inbound_form"
      | "inbound_email"
      | "outbound_agent"
      | "outbound_ack"
      | "outbound_team";
    providerMessageId?: string;
    subject?: string;
    bodyText?: string;
  }
) {
  const [row] = await db
    .insert(emailMessages)
    .values({
      threadId: input.threadId,
      runId: input.runId,
      direction: input.direction,
      providerMessageId: input.providerMessageId,
      subject: input.subject,
      bodyText: input.bodyText,
    })
    .returning();
  return row;
}

export async function updateThreadAfterRun(
  db: EmailDb,
  threadId: string,
  input: {
    status: "needs_human" | "auto_replied";
    lastOutboundProviderId?: string;
  }
) {
  await db
    .update(emailThreads)
    .set({
      status: input.status,
      lastOutboundProviderId: input.lastOutboundProviderId,
      updatedAt: new Date(),
    })
    .where(eq(emailThreads.id, threadId));
}
