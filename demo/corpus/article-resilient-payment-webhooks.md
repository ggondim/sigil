# Designing Resilient Payment Webhook Handlers

*Patterns for idempotency, retry safety, and async processing*

By Maya Iyer · Published April 28, 2026 · From the Hatch Engineering Blog

---

Every payments engineer I've talked to has the same scar tissue: a webhook handler that worked fine in staging, then under bursty production load started returning 504s, then Stripe (or PayPal, or Adyen) retried, and somewhere in the retry storm one customer got double-charged. This essay is the consolidation of what I wish someone had handed me before I built my first payment-processing service.

There are three patterns you have to get right at the same time: **idempotency at multiple layers**, **async-first handler design**, and **explicit event lifecycle tracking**. Get one wrong and the other two won't save you.

## 1. Idempotency is not one mechanism, it's three

Most engineers reach for one idempotency check: `SELECT * FROM events WHERE event_id = $1`. If found, skip. This is necessary but not sufficient. Under real concurrency you need three layers stacked:

**Layer A — HTTP idempotency key.** When you make outbound calls *to* payment providers, send a client-generated `Idempotency-Key` header. Stripe, PayPal, and Adyen all honour this — duplicate requests with the same key return the original response without re-charging. This is the only layer that protects you against your own retries.

**Layer B — event ID dedup.** When you receive inbound webhooks, key on the provider's event ID. Store it in a `processed_events` table with a unique constraint. First seen wins.

**Layer C — row-level lock during processing.** This is the one most people miss. Even with the event ID check, two concurrent retries can both read "not yet processed," both pass the check, and both proceed to mutate state. The fix is a `SELECT ... FOR UPDATE` on the event row inside the same transaction that performs the side effect. The second request blocks until the first commits, then sees the row marked processed and exits cleanly.

```sql
BEGIN;
SELECT * FROM webhook_events
  WHERE event_id = $1
  FOR UPDATE;
-- if already processed, COMMIT and return early
-- else: do the work, mark processed, COMMIT
```

The three layers cover three different concurrency patterns: your own retries, the provider's retries, and overlap between the two.

## 2. Webhook handlers should do almost nothing

Stripe's documented webhook timeout is 30 seconds. PayPal's is 25. If your handler takes longer than that — even occasionally — the provider gives up and retries. Retries amplify load. Load slows handlers further. The system enters a doom loop.

The fix is simple in principle, hard in practice: **the handler returns 200 within milliseconds**. All actual work happens in a background queue.

In practice this means your webhook route does only three things:

1. Verify the signature (cheap, ~1ms)
2. Insert the event into a `webhook_events` table with status `received`
3. Enqueue a job that will do the real work
4. Return 200

Everything else — updating the user record, sending the Slack notification, calling downstream services, generating invoices — happens in the queue worker, where it can take 30 seconds or 5 minutes without affecting the handler's response time.

I've seen teams resist this because "we don't have a queue system." This is the wrong battle to fight. Pick any of: Inngest, BullMQ, Sidekiq, Cloud Tasks, RabbitMQ. Wire it before the first webhook ships. Retrofitting async-first design after the service is in production is multi-week work.

## 3. Track the event lifecycle explicitly

A common mistake: a boolean `processed` column. This is too coarse. What you actually want is a state machine:

- `received` — handler accepted the webhook, signature verified, but no work has started
- `processing` — a worker picked up the job and is mid-flight
- `processed` — work completed successfully
- `failed` — work errored after exhausting retries (needs human attention)

The benefits compound:

- **Observability**: counts by status give you instant signal on backlog and failure rates
- **Recovery**: stuck `processing` rows older than your worker timeout are immediate retry candidates
- **Replay**: failed events have full context for forensic review
- **Idempotency**: the `FOR UPDATE` check from §1 has more to say than "yes/no"

Don't skip the failed bucket. The most expensive incidents I've seen were silent failures where a webhook errored, the worker swallowed the exception, and three weeks later a customer noticed their subscription was wrong.

## 4. Signature verification, always

If your webhook endpoint isn't checking the provider's signature header (Stripe's `Stripe-Signature`, PayPal's `PAYPAL-TRANSMISSION-SIG`), anyone who finds your URL can post arbitrary payloads. This sounds obvious; it's also the most common thing I see missing in code review.

Use the provider's official library to verify (`stripe.webhooks.constructEvent`, etc). Don't roll your own HMAC comparison — they almost always have a constant-time-comparison bug.

## 5. Exponential backoff on outbound retries

When your worker calls downstream services (Slack, your CRM, internal APIs), failures will happen. Retry, but with exponential backoff: 1s, 2s, 4s, 8s, 16s, with jitter. Cap the total retry budget at 5 minutes; after that, fail the event and move on. Without a cap, a downstream outage produces a queue backlog you'll be working through for hours.

## 6. The 25-second handler budget

Even though Stripe's documented timeout is 30s, I treat 25s as the hard ceiling inside the handler. The extra 5 seconds gives the queue time to acknowledge the job before Stripe gives up. If your handler is approaching 20s, something is wrong — you've broken the §2 rule and are doing work synchronously.

## Putting it together

A correctly-structured payment webhook service has these characteristics:

- Handler verifies signature, inserts into `webhook_events`, enqueues, returns 200 in under 100ms
- Worker pulls from queue, opens transaction, takes row-level lock, does work, marks `processed`, commits
- Outbound calls to providers use idempotency keys; outbound calls to internal services use exponential backoff
- Event state machine: `received → processing → processed | failed`
- All failures are visible: failed events get logged, alerts fire on backlog growth

If your service does these five things, you'll handle a 100x traffic spike and a downstream outage on the same day without losing data. If it does fewer than five, you'll find out which one was missing during your next incident.

---

*Maya Iyer leads platform engineering at Hatch. This essay draws on three years of building payment infrastructure at consumer fintechs, two of which involved at-3am incident calls she'd rather not relive.*
