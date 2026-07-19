# @app/email

Outbound email + **LangGraph contact agent** (structured graph, not a free-roaming agent).

## Behavior

```
hard_rules → require_llm_key → load_kb → classify → draft → policy_check → send|escalate → persist
```

- **No `OPENAI_API_KEY`** → escalate to human (team email + user ack)
- **Hard rules** (security/secrets/legal/privacy) → escalate, never auto-reply
- **Confident + KB-grounded** → LLM drafts and sends auto-reply
- **Unsure** → escalate (`[NEEDS MANUAL REPLY]` to `CONTACT_TO_EMAIL`)
- Every run is stored in Postgres (`op.email_threads`, `op.email_agent_runs`, `op.email_messages`)
- Inbound replies (Resend webhook) continue the same thread

## Setup

```bash
EMAIL_PROVIDER=console          # or resend
RESEND_API_KEY=
EMAIL_FROM=Prediction Ledger <onboarding@resend.dev>
CONTACT_TO_EMAIL=you@gmail.com
OPENAI_API_KEY=sk-...           # required for LLM auto-replies
EMAIL_AGENT_MODEL=gpt-4o-mini
CONTACT_AUTO_REPLY_MIN_CONFIDENCE=0.75
RESEND_WEBHOOK_SECRET=          # set in production
```

Knowledge base: [`kb/product.md`](./kb/product.md) — edit this file to teach the agent.

### Resend inbound (thread replies)

1. Enable inbound / receiving in Resend (or forward replies to their inbound address)
2. Webhook URL: `https://your-host/api/email/webhook`
3. Subscribe to `email.received` (and delivery events if desired)

Local stub:

```bash
curl -X POST http://localhost:3000/api/email/webhook \
  -H 'content-type: application/json' \
  -d '{
    "type": "email.received",
    "data": {
      "from": "user@example.com",
      "subject": "Re: How does scoring work?",
      "text": "Thanks — can you also point me to developers docs?",
      "in_reply_to": "PROVIDER_ID_FROM_PRIOR_OUTBOUND"
    }
  }'
```

### Domain later

Keep `onboarding@resend.dev` until you verify your domain, then change only `EMAIL_FROM`.

## Migrate

```bash
pnpm migrate
pnpm db:roles
```
