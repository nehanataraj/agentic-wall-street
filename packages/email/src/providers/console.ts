import type { EmailProvider, SendEmailInput, SendEmailResult } from "../types.js";

/**
 * Local / CI provider: never leaves the process.
 * Swap to Resend by setting EMAIL_PROVIDER=resend + RESEND_API_KEY.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const id = `console_${Date.now().toString(36)}`;
    const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;
    console.info(
      JSON.stringify({
        level: "info",
        msg: "email_console_send",
        id,
        to,
        subject: input.subject,
        replyTo: input.replyTo,
        tags: input.tags,
        textPreview: (input.text ?? stripTags(input.html)).slice(0, 240),
      })
    );
    return { id, provider: "console" };
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
