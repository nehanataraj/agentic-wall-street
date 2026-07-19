import { Resend } from "resend";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types.js";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  private readonly client: Resend;
  private readonly from: string;
  private readonly defaultReplyTo?: string;

  constructor(opts: { apiKey: string; from: string; replyTo?: string }) {
    if (!opts.apiKey) {
      throw new Error("ResendEmailProvider requires apiKey");
    }
    if (!opts.from) {
      throw new Error("ResendEmailProvider requires from");
    }
    this.client = new Resend(opts.apiKey);
    this.from = opts.from;
    this.defaultReplyTo = opts.replyTo;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo ?? this.defaultReplyTo,
        tags: input.tags
          ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("Resend send failed: missing message id");
    }
    return { id: data.id, provider: "resend" };
  }
}
