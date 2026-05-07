# Postmortem: Stripe webhook 504s — 2026-04-25

## Summary
Stripe webhook handlers timed out (504) under bursty load on
2026-04-23. Stripe retried, causing duplicate user-state mutations
and one billing double-charge. Customer impact: 3 users overcharged,
all refunded within 4 hours of detection.

## Timeline
- **2026-04-23 14:12 UTC** — Stripe retry storm begins after first
  webhook handler exceeds 30s.
- **14:31 UTC** — On-call alerted by `webhook_handler_p99 > 25s` SLO
  burn alert.
- **14:48 UTC** — Slack notification queue identified as the slow path.
- **15:20 UTC** — Hotfix deployed: Slack call moved to background.
- **18:30 UTC** — Three double-charges identified, refunded.

## Root cause
Slow Slack-notification path inside the handler kept the request
alive beyond Stripe's 30s budget. Handler was idempotent in name
only — we keyed on `event.id` but duplicate retries arrived
concurrently and both passed the existence check before either
committed.

## Fixes applied
1. Slack notification moved to background queue (Inngest).
2. Idempotency upgraded to row-level lock on `event.id` with
   `SELECT ... FOR UPDATE`.
3. Webhook handler hard-bounded at 25s; anything slower bails
   to queue and returns 200 to Stripe.

## Lessons
- Stripe's 30s budget is a hard wall, not a target.
- "Idempotent" needs to mean "concurrent-safe," not just "replay-safe."
- Always queue long-running work in webhook handlers — even when it
  "shouldn't" be slow.
