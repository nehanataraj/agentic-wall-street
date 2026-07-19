import { Annotation } from "@langchain/langgraph";

export type EmailAgentAction = "auto_reply" | "escalate";
export type EmailAgentSource = "form" | "inbound";

export const EmailAgentState = Annotation.Root({
  source: Annotation<EmailAgentSource>,
  contactName: Annotation<string>,
  contactEmail: Annotation<string>,
  subject: Annotation<string>,
  message: Annotation<string>,
  threadId: Annotation<string | undefined>,
  openaiApiKey: Annotation<string | undefined>,
  model: Annotation<string>,
  autoReplyMinConfidence: Annotation<number>,

  hardRuleHit: Annotation<string | undefined>,
  kbVersion: Annotation<string | undefined>,
  kbText: Annotation<string | undefined>,

  action: Annotation<EmailAgentAction | undefined>,
  category: Annotation<string | undefined>,
  confidence: Annotation<number | undefined>,
  reasoning: Annotation<string | undefined>,
  draftSubject: Annotation<string | undefined>,
  draftBody: Annotation<string | undefined>,
  policyViolation: Annotation<string | undefined>,
});

export type EmailAgentStateType = typeof EmailAgentState.State;
