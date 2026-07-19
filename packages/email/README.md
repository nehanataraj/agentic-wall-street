# @app/email

Provider-agnostic outbound email layer. Local default is **console** (logs only). Swap to **Resend** when you have an API key — and later a verified domain — without changing call sites.

## Setup Resend

### 1. Create an account
1. Sign up at [https://resend.com](https://resend.com)
2. Create an API key (Dashboard → API Keys)
3. Put it in `.env` as `RESEND_API_KEY`

### 2. Send without a custom domain (now)
Resend lets you send from their onboarding address while prototyping:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="Prediction Ledger <onboarding@resend.dev>"
CONTACT_TO_EMAIL=you@your-personal-email.com
```

With `EMAIL_PROVIDER=console` (default), no key is required — submissions are logged in the API/server console.

### 3. Add your domain later
When you buy a domain:

1. Resend Dashboard → **Domains** → **Add Domain**
2. Add the DNS records they show (SPF + DKIM; optionally DMARC)
3. Wait until status is **Verified**
4. Change only env:

```bash
EMAIL_FROM="Prediction Ledger <hello@yourdomain.com>"
EMAIL_REPLY_TO=hello@yourdomain.com
```

No code changes required.

### 4. Optional webhook (later)
Stub route: `POST /api/email/webhook`  
Wire Resend event webhooks there for delivery / bounce / complaint tracking once you care about deliverability metrics.

## Usage

```ts
import { createEmailClient, renderContactNotification } from "@app/email";

const email = createEmailClient();
const body = renderContactNotification({
  name: "Ada",
  email: "ada@example.com",
  subject: "Hello",
  message: "…",
});

await email.send({
  to: process.env.CONTACT_TO_EMAIL!,
  subject: body.subject,
  html: body.html,
  text: body.text,
  replyTo: "ada@example.com",
  tags: { kind: "contact" },
});
```

## Env vars

| Variable | Description |
|---|---|
| `EMAIL_PROVIDER` | `console` (default) or `resend` |
| `RESEND_API_KEY` | Resend secret key |
| `EMAIL_FROM` | From header; use `onboarding@resend.dev` until domain is verified |
| `EMAIL_REPLY_TO` | Optional default Reply-To |
| `CONTACT_TO_EMAIL` | Inbox that receives Contact Us submissions |
