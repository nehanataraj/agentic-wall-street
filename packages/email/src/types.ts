export type EmailAddress = string;

export interface SendEmailInput {
  /** Recipient(s). */
  to: EmailAddress | EmailAddress[];
  /** Subject line. */
  subject: string;
  /** HTML body. Prefer templates from `./templates`. */
  html: string;
  /** Plain-text fallback. */
  text?: string;
  /** Optional reply-to. */
  replyTo?: EmailAddress;
  /**
   * Provider idempotency key (Resend supports this).
   * Use for retries so the same contact submission is not sent twice.
   */
  idempotencyKey?: string;
  /** Free-form tags for analytics / agent routing later. */
  tags?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
  provider: "console" | "resend";
}

export interface EmailProvider {
  readonly name: "console" | "resend";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export interface EmailClientConfig {
  provider: "console" | "resend";
  /** Required when provider === "resend". */
  apiKey?: string;
  /** Default From header, e.g. "Prediction Ledger <onboarding@resend.dev>". */
  from: string;
  /** Optional default reply-to. */
  replyTo?: string;
}
