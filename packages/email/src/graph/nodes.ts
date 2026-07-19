import { z } from "zod";
import type { EmailAgentStateType } from "./state.js";
import { loadProductKnowledgeBase } from "../kb/load.js";

const HARD_RULES: Array<{ id: string; re: RegExp }> = [
  { id: "security", re: /\b(password|api[ _-]?key|private key|secret|vulnerability|cve|hack|breach|exploit|malware|credential)\b/i },
  { id: "confidential", re: /\b(nda|confidential|non[- ]disclosure|internal only|do not share)\b/i },
  { id: "legal_threat", re: /\b(lawsuit|subpoena|dmca|attorney|solicitor|legal threat|cease and desist)\b/i },
  { id: "account_privacy", re: /\b(gdpr|ccpa|delete (my )?account|data subject|right to be forgotten)\b/i },
  { id: "payment", re: /\b(credit card|ssn|social security|wire transfer|routing number)\b/i },
];

const classifySchema = z.object({
  action: z.enum(["auto_reply", "escalate"]),
  category: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const draftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export function hardRulesNode(state: EmailAgentStateType): Partial<EmailAgentStateType> {
  const blob = `${state.subject}\n${state.message}`;
  for (const rule of HARD_RULES) {
    if (rule.re.test(blob)) {
      return {
        hardRuleHit: rule.id,
        action: "escalate",
        category: rule.id,
        confidence: 1,
        reasoning: `Hard rule blocked auto-reply: ${rule.id}`,
      };
    }
  }
  return { hardRuleHit: undefined };
}

export function requireLlmKeyNode(state: EmailAgentStateType): Partial<EmailAgentStateType> {
  if (state.hardRuleHit) return {};
  if (!state.openaiApiKey) {
    return {
      action: "escalate",
      category: "no_llm_key",
      confidence: 1,
      reasoning: "OPENAI_API_KEY missing — default to human review",
    };
  }
  return {};
}

export function loadKbNode(_state: EmailAgentStateType): Partial<EmailAgentStateType> {
  const kb = loadProductKnowledgeBase();
  return { kbVersion: kb.version, kbText: kb.text };
}

export async function classifyNode(
  state: EmailAgentStateType
): Promise<Partial<EmailAgentStateType>> {
  if (state.action === "escalate" && (state.hardRuleHit || state.category === "no_llm_key")) {
    return {};
  }
  if (!state.openaiApiKey) {
    return {
      action: "escalate",
      category: "no_llm_key",
      confidence: 1,
      reasoning: "OPENAI_API_KEY missing — default to human review",
    };
  }

  const system = [
    "You classify inbound contact messages for Prediction Ledger.",
    "Return ONLY JSON: {\"action\":\"auto_reply\"|\"escalate\",\"category\":string,\"confidence\":0-1,\"reasoning\":string}.",
    "auto_reply ONLY when the knowledge base clearly answers the question.",
    "escalate for partnerships, press, security, account/privacy, billing, legal, or anything unclear.",
    "Prefer escalate when unsure. Never give investment advice.",
  ].join(" ");

  const user = [
    "KNOWLEDGE BASE:",
    state.kbText ?? "",
    "",
    "MESSAGE:",
    `Name: ${state.contactName}`,
    `Email: ${state.contactEmail}`,
    `Subject: ${state.subject}`,
    state.message,
  ].join("\n");

  const parsed = await callJson(state.openaiApiKey, state.model, system, user, classifySchema);
  if (!parsed) {
    return {
      action: "escalate",
      category: "classifier_failure",
      confidence: 1,
      reasoning: "Classifier failed — escalate to human",
    };
  }

  const min = state.autoReplyMinConfidence;
  if (parsed.action === "auto_reply" && parsed.confidence < min) {
    return {
      ...parsed,
      action: "escalate",
      reasoning: `${parsed.reasoning} (confidence ${parsed.confidence} < ${min})`,
    };
  }

  return parsed;
}

export async function draftNode(
  state: EmailAgentStateType
): Promise<Partial<EmailAgentStateType>> {
  if (state.action !== "auto_reply" || !state.openaiApiKey) {
    return {};
  }

  const system = [
    "Draft a short email reply for Prediction Ledger contact form.",
    "Return ONLY JSON: {\"subject\":string,\"body\":string}.",
    "Use ONLY the knowledge base. If KB is insufficient, set body to ESCALATE.",
    "Start with a greeting using their name.",
    "End with: — Prediction Ledger (automated assistant)",
    "State clearly this is automated and a human will take over if needed.",
    "Never give investment advice or trading recommendations.",
    "Do not invent product features.",
  ].join(" ");

  const user = [
    "KNOWLEDGE BASE:",
    state.kbText ?? "",
    "",
    "USER MESSAGE:",
    `Name: ${state.contactName}`,
    `Subject: ${state.subject}`,
    state.message,
  ].join("\n");

  const parsed = await callJson(state.openaiApiKey, state.model, system, user, draftSchema);
  if (!parsed || /ESCALATE/i.test(parsed.body)) {
    return {
      action: "escalate",
      category: state.category ?? "draft_insufficient",
      reasoning: "Draft declined — knowledge base insufficient",
      draftSubject: undefined,
      draftBody: undefined,
    };
  }

  return {
    draftSubject: parsed.subject.slice(0, 200),
    draftBody: parsed.body.slice(0, 8000),
  };
}

export function policyCheckNode(state: EmailAgentStateType): Partial<EmailAgentStateType> {
  if (state.action !== "auto_reply" || !state.draftBody) return {};

  const bad =
    /\b(buy|sell|long|short)\b.{0,40}\b(now|today|immediately)\b/i.test(state.draftBody) ||
    /\binvestment advice\b/i.test(state.draftBody) ||
    /\bguaranteed (returns|profit)\b/i.test(state.draftBody) ||
    /\bpassword\b|\bapi key\b|\bprivate key\b/i.test(state.draftBody);

  if (bad) {
    return {
      action: "escalate",
      policyViolation: "unsafe_draft",
      reasoning: "Policy check rejected draft — escalate to human",
      draftSubject: undefined,
      draftBody: undefined,
    };
  }

  return {};
}

async function callJson<T>(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Exported for unit tests. */
export function evaluateHardRules(subject: string, message: string): string | undefined {
  const blob = `${subject}\n${message}`;
  for (const rule of HARD_RULES) {
    if (rule.re.test(blob)) return rule.id;
  }
  return undefined;
}
