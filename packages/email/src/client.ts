import { ConsoleEmailProvider } from "./providers/console.js";
import { ResendEmailProvider } from "./providers/resend.js";
import type { EmailClientConfig, EmailProvider, SendEmailInput, SendEmailResult } from "./types.js";

/**
 * Build an email provider from env or an explicit config.
 *
 * Defaults to console when EMAIL_PROVIDER is unset / "console", or when
 * RESEND_API_KEY is missing — so local dev works without a domain.
 */
export function createEmailClient(
  config: EmailClientConfig | NodeJS.ProcessEnv = process.env
): EmailProvider {
  const resolved = isProcessEnv(config) ? configFromEnv(config) : config;

  if (resolved.provider === "resend") {
    if (!resolved.apiKey) {
      throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
    }
    return new ResendEmailProvider({
      apiKey: resolved.apiKey,
      from: resolved.from,
      replyTo: resolved.replyTo,
    });
  }

  return new ConsoleEmailProvider();
}

export async function sendEmail(
  input: SendEmailInput,
  client: EmailProvider = createEmailClient()
): Promise<SendEmailResult> {
  return client.send(input);
}

function isProcessEnv(value: EmailClientConfig | NodeJS.ProcessEnv): value is NodeJS.ProcessEnv {
  return !("provider" in value && "from" in value);
}

function configFromEnv(env: NodeJS.ProcessEnv): EmailClientConfig {
  const requested = (env["EMAIL_PROVIDER"] ?? "console").toLowerCase();
  const apiKey = env["RESEND_API_KEY"];
  const from =
    env["EMAIL_FROM"] ?? "Prediction Ledger <onboarding@resend.dev>";
  const replyTo = env["EMAIL_REPLY_TO"] || undefined;

  // Fail open to console if Resend was requested without a key — safer for scaffolding.
  if (requested === "resend" && apiKey) {
    return { provider: "resend", apiKey, from, replyTo };
  }

  if (requested === "resend" && !apiKey) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "email_provider_fallback_console",
        reason: "RESEND_API_KEY missing",
      })
    );
  }

  return { provider: "console", from, replyTo };
}
