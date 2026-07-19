import { createEmailClient } from "../client.js";
import { buildEmailAgentGraph } from "./workflow.js";
import type { EmailAgentAction, EmailAgentSource } from "./state.js";
import {
  renderContactAck,
  renderContactNotification,
} from "../templates/contact.js";
import type { EmailProvider } from "../types.js";
import {
  createEmailThread,
  findOpenThreadByEmailAndSubject,
  findThreadById,
  findThreadByOutboundProviderId,
  getEmailDb,
  insertAgentRun,
  insertEmailMessage,
  updateThreadAfterRun,
  type EmailDb,
} from "../persist.js";

export interface RunEmailAgentInput {
  source: EmailAgentSource;
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Existing thread for inbound replies. */
  threadId?: string;
  /** In-Reply-To / provider id used to locate thread. */
  inReplyToProviderId?: string;
  teamTo?: string;
  client?: EmailProvider;
  db?: EmailDb;
}

export interface RunEmailAgentResult {
  threadId: string;
  runId: string;
  action: EmailAgentAction;
  category?: string;
  confidence?: number;
  reasoning?: string;
  teamMessageId?: string;
  userMessageId?: string;
}

export async function runEmailAgent(
  input: RunEmailAgentInput
): Promise<RunEmailAgentResult> {
  const db = input.db ?? getEmailDb();
  const client = input.client ?? createEmailClient();
  const teamTo = input.teamTo ?? process.env["CONTACT_TO_EMAIL"];
  if (!teamTo) throw new Error("CONTACT_TO_EMAIL is required");

  const openaiApiKey = process.env["OPENAI_API_KEY"] || undefined;
  const model = process.env["EMAIL_AGENT_MODEL"] ?? "gpt-4o-mini";
  const autoReplyMinConfidence = Number(
    process.env["CONTACT_AUTO_REPLY_MIN_CONFIDENCE"] ?? "0.75"
  );

  let thread =
    (input.threadId ? await findThreadById(db, input.threadId) : null) ??
    (input.inReplyToProviderId
      ? await findThreadByOutboundProviderId(db, input.inReplyToProviderId)
      : null) ??
    (input.source === "inbound"
      ? await findOpenThreadByEmailAndSubject(db, input.email, input.subject)
      : null);

  if (!thread) {
    thread = await createEmailThread(db, {
      contactEmail: input.email,
      contactName: input.name,
      subject: input.subject,
    });
  }

  await insertEmailMessage(db, {
    threadId: thread.id,
    direction: input.source === "form" ? "inbound_form" : "inbound_email",
    subject: input.subject,
    bodyText: input.message,
  });

  const graph = buildEmailAgentGraph();
  const state = await graph.invoke({
    source: input.source,
    contactName: input.name,
    contactEmail: input.email,
    subject: input.subject,
    message: input.message,
    threadId: thread.id,
    openaiApiKey,
    model,
    autoReplyMinConfidence,
  });

  const action: EmailAgentAction = state.action === "auto_reply" ? "auto_reply" : "escalate";

  const triageForTemplate = {
    action,
    category: (state.category ?? "unclear") as
      | "methodology"
      | "developers"
      | "legal_disclaimer"
      | "general_info"
      | "partnership"
      | "account_or_ops"
      | "bug_or_security"
      | "unclear",
    confidence: state.confidence ?? 0,
    reasoning: state.reasoning ?? "",
    engine: "llm" as const,
  };

  const teamBody = renderContactNotification(
    {
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    },
    triageForTemplate
  );

  const team = await client.send({
    to: teamTo,
    subject: teamBody.subject,
    html: teamBody.html,
    text: teamBody.text,
    replyTo: input.email,
    tags: {
      kind: "contact_team",
      action,
      threadId: thread.id,
    },
  });

  let userMessageId: string | undefined;
  let userDirection: "outbound_agent" | "outbound_ack" = "outbound_ack";

  if (action === "auto_reply" && state.draftBody) {
    const subject = state.draftSubject ?? `Re: ${input.subject}`;
    const html = `<div style="font-family: Georgia, serif; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(state.draftBody)}</div>`;
    const sent = await client.send({
      to: input.email,
      subject,
      html,
      text: state.draftBody,
      tags: { kind: "contact_auto_reply", threadId: thread.id },
    });
    userMessageId = sent.id;
    userDirection = "outbound_agent";
  } else {
    const ack = renderContactAck({
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    });
    const sent = await client.send({
      to: input.email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      tags: { kind: "contact_ack", threadId: thread.id },
    });
    userMessageId = sent.id;
    userDirection = "outbound_ack";
  }

  const run = await insertAgentRun(db, {
    threadId: thread.id,
    source: input.source,
    model: openaiApiKey ? model : undefined,
    action,
    category: state.category,
    confidence: state.confidence,
    reasoning: state.reasoning,
    draftSubject: state.draftSubject,
    draftBody: state.draftBody,
    kbVersion: state.kbVersion,
    hardRuleHit: state.hardRuleHit,
    teamProviderId: team.id,
    userProviderId: userMessageId,
  });

  await insertEmailMessage(db, {
    threadId: thread.id,
    runId: run.id,
    direction: "outbound_team",
    providerMessageId: team.id,
    subject: teamBody.subject,
    bodyText: teamBody.text,
  });

  await insertEmailMessage(db, {
    threadId: thread.id,
    runId: run.id,
    direction: userDirection,
    providerMessageId: userMessageId,
    subject:
      action === "auto_reply"
        ? state.draftSubject ?? `Re: ${input.subject}`
        : `We received your message — ${input.subject}`,
    bodyText: action === "auto_reply" ? state.draftBody : undefined,
  });

  await updateThreadAfterRun(db, thread.id, {
    status: action === "auto_reply" ? "auto_replied" : "needs_human",
    lastOutboundProviderId: userMessageId,
  });

  console.info(
    JSON.stringify({
      level: "info",
      msg: "email_agent_run",
      threadId: thread.id,
      runId: run.id,
      action,
      category: state.category,
      confidence: state.confidence,
      hardRuleHit: state.hardRuleHit,
      model: openaiApiKey ? model : null,
    })
  );

  return {
    threadId: thread.id,
    runId: run.id,
    action,
    category: state.category,
    confidence: state.confidence,
    reasoning: state.reasoning,
    teamMessageId: team.id,
    userMessageId,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
