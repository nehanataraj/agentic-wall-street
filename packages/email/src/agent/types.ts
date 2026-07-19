export type ContactTriageAction = "auto_reply" | "escalate";

export type ContactTriageCategory =
  | "methodology"
  | "developers"
  | "legal_disclaimer"
  | "general_info"
  | "partnership"
  | "account_or_ops"
  | "bug_or_security"
  | "unclear";

export interface ContactTriageResult {
  action: ContactTriageAction;
  category: ContactTriageCategory;
  /** 0–1 confidence in the decision. Auto-reply only when high enough. */
  confidence: number;
  reasoning: string;
  /** Which engine produced the decision. */
  engine: "rules" | "llm" | "fallback_escalate";
}

export interface ContactAgentConfig {
  /** When false, only forward to CONTACT_TO_EMAIL (legacy behavior). */
  enabled: boolean;
  /** Minimum confidence required to auto-reply instead of escalate. */
  autoReplyMinConfidence: number;
  /** Optional OpenAI key for LLM triage. Rules always run first. */
  openaiApiKey?: string;
}
