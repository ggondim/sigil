# Authoring into `playbook` pods

A playbook pod captures **how the user does a recurring procedure**: a debugging recipe, a deploy ritual, a triage workflow. This is procedural memory, the CoALA "how" complement to claude_session's "what". A playbook is read by future sessions (and future agents) to *act*, not just to learn.

## What to extract

- **Ordered steps.** "1. Check the Sentry alert. 2. Reproduce in staging. 3. Roll back via LaunchDarkly killswitch if reproduction is fast. 4. Otherwise file a same-day fix PR."
- **Decision branches.** "If the webhook is from Stripe, verify with `Stripe-Signature`. If from PayPal, verify with `PAYPAL-TRANSMISSION-SIG`."
- **Gotchas and footguns.** "Never hand-write a Knex migration timestamp, use `pnpm knex migrate:make`."
- **Tool commands.** Exact CLI / API calls that the procedure uses. Copy-paste fidelity matters here.
- **What "done" looks like.** A clear success signal for the procedure.

## What NOT to extract

- **One-time exploration.** Playbooks are reused. If it's a one-time investigation, it's a claude_session fact.
- **Narration.** "Then I tried X" is fine in a session pod, useless in a playbook.
- **Vague heuristics.** "Be careful when touching auth", too soft to act on. Tighten or skip.

## Style

- Imperative voice ("Check the alert. Roll back if…").
- Steps in order. Branches and conditionals explicit.
- Code/CLI commands in backticks, exact as typed.
- Each step gets its own fact, or a small set of related steps grouped, never one giant blob.

## Importance

Default importance is `3` (medium). Bump to `4` for procedures whose mistakes would cause incidents. `5` (vital) for safety-critical procedures (data deletion, secret rotation, prod migration).
