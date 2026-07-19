import { runEmailAgent } from "../graph/run.js";
import type { ContactMessageInput } from "../templates/contact.js";
import type { EmailProvider, SendEmailResult } from "../types.js";
import type { ContactTriageResult } from "./types.js";

export interface HandleContactInput extends ContactMessageInput {
  teamTo: string;
  client: EmailProvider;
  idempotencySeed?: string;
}

export interface HandleContactResult {
  triage: ContactTriageResult | null;
  team: SendEmailResult;
  user?: SendEmailResult;
  threadId?: string;
  runId?: string;
}

/**
 * Contact form entrypoint — runs the LangGraph email agent and persists the thread.
 */
export async function handleContactSubmission(
  input: HandleContactInput
): Promise<HandleContactResult> {
  const result = await runEmailAgent({
    source: "form",
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    teamTo: input.teamTo,
    client: input.client,
  });

  const triage: ContactTriageResult = {
    action: result.action,
    category: (result.category as ContactTriageResult["category"]) ?? "unclear",
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? "",
    engine: process.env["OPENAI_API_KEY"] ? "llm" : "fallback_escalate",
  };

  return {
    triage,
    team: {
      id: result.teamMessageId ?? result.runId,
      provider: input.client.name,
    },
    user: result.userMessageId
      ? { id: result.userMessageId, provider: input.client.name }
      : undefined,
    threadId: result.threadId,
    runId: result.runId,
  };
}
