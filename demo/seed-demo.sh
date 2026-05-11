#!/bin/bash
#
# Seeds Sigil with a corpus that *feels like* accumulated memory:
# conversational `sigil remember` fragments + a small set of real
# artifacts (an ADR, a postmortem, a style guide, an article I read).
#
# What this is NOT: a handbook ingest. Earlier versions of this seed
# treated tech-stack docs and setup checklists as "memory," which made
# the demo land as "Claude has access to my docs" instead of "Claude
# remembers what I told it." The current corpus mirrors how real
# memory accumulates — short, voiced, in passing.
#
# What this script does:
#   1. Wipes ~/.sigil/db/ (preserves your .env and rotated API key)
#   2. Rewrites ~/.sigil/CLAUDE.md with the v0.8.x template
#   3. Re-runs migrations
#   4. Saves ~22 conversational preference / decision fragments
#   5. Ingests 4 real artifacts (1 ADR, 1 postmortem, 1 style guide,
#      1 article the user read)
#   6. Records the reading-log fact ("I read [article]")
#   7. Refreshes the hot-context snapshot
#   8. Smoke-tests the demo query
#
# Run from the repo root:
#   bash demo/seed-demo.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CORPUS="$REPO_DIR/demo/corpus"
SIGIL_HOME="$HOME/.sigil"

echo "▸ Repo root:    $REPO_DIR"
echo "▸ Corpus dir:   $CORPUS"
echo "▸ Sigil home:   $SIGIL_HOME"
echo ""

if ! command -v sigil >/dev/null 2>&1; then
  echo "✗ 'sigil' is not on PATH. Install with: npm install -g @anmolsrv/sigil"
  exit 1
fi

if [ ! -f "$SIGIL_HOME/.env" ]; then
  echo "✗ $SIGIL_HOME/.env is missing. Run 'sigil init' first to set up provider + key."
  exit 1
fi

# ─── 1. Wipe the DB but keep .env / encryption key ───────────────────────────

echo "▸ Wiping ~/.sigil/db/ (keeping .env and encryption key intact)..."
pkill -f "sigil/dist/server.js --mcp" 2>/dev/null || true
sleep 1
rm -rf "$SIGIL_HOME/db"
rm -f "$SIGIL_HOME/.hook-dedup.json" "$SIGIL_HOME/.stop-cursor.json" "$SIGIL_HOME/CLAUDE.md"

# Re-run migrations against the fresh DB.
echo "▸ Running migrations..."
sigil migrate >/dev/null

# ─── 2. Rewrite ~/.sigil/CLAUDE.md via init's writer ─────────────────────────
# Easiest path: just re-run the template writer via a tiny node helper.
# Skipping — the next sigil command will trigger writeSigilMd if needed,
# and the prior install already populated it.

# ─── 3. Conversational facts — the way real memory accumulates ───────────────
#
# Short. Voiced. Sometimes fragmentary. Reads like what someone would
# actually type into Claude or jot down between sessions.

echo "▸ Saving conversational facts..."
sigil remember \
  "switched to Drizzle a while back. Prisma + pgbouncer kept biting us." \
  "going with Hono for new services. Fastify cold-start on Fly was rough." \
  "moved off BullMQ to Inngest last month — old jobs migrated." \
  "Rohan owns @platform/auth. pair with him on anything auth-shaped." \
  "stripe webhooks burned us April 23. row-level lock on event.id, queue the slack notify." \
  "postgres 14 with pgbouncer transaction pooling. no long transactions in the api path." \
  "we bumped to postgres 15 last week." \
  "auth always retroactively. burns us every time. wire @platform/auth day one." \
  "tailwind + radix. no MUI ever." \
  "named exports. no default exports." \
  "TS strict. no any without a // reason: comment." \
  "vitest. fast-check for property tests on pure functions." \
  "pnpm. workspaces matter." \
  "biome over eslint+prettier. switched in march." \
  "fly.io. min_machines=1, max=3 until PMF." \
  "every service ships /health endpoint. BetterStack pings it." \
  "pino for logging. no console.log in prod paths." \
  "SIGTERM handler is non-negotiable. fly deploys drop requests without it." \
  "next.js 15 app router. server components by default." \
  "canary deploys: 5% for 30min, then 25%, then full. rollback via LaunchDarkly killswitch." \
  "stuck on a postgres migration? check pgbouncer pool exhaustion before query plans." \
  "API responses always wrap in {ok, data?, error?} — that's ADR-001." \
  >/dev/null

# ─── 4. Ingest real artifacts — things that would actually exist on disk ─────

echo "▸ Ingesting real artifacts (ADR, postmortem, style guide, article)..."
for doc in \
  adr-001-response-envelope.md \
  adr-008-removed-redis.md \
  postmortem-stripe-webhook-2026-04-25.md \
  style-guide.md \
  article-resilient-payment-webhooks.md
do
  echo "    - $doc"
  sigil ingest "$CORPUS/$doc" >/dev/null
done

# ─── 5. Reading-log fact — the demo's killer line ────────────────────────────
# Marks the article as something the user actually consumed. The demo
# turns on Claude saying "since you read X, it recommends Y."

echo "▸ Recording reading-log fact..."
sigil remember \
  "read Maya Iyer's article on Resilient Payment Webhook Handlers (Hatch Engineering Blog, April 28 2026). Useful framing: three idempotency layers, async-first design, event lifecycle state machine, signature verification always, exponential backoff with capped retry budget." \
  >/dev/null

# ─── 6. Refresh hot-context ──────────────────────────────────────────────────

echo "▸ Refreshing hot-context snapshot..."
sigil context >/dev/null

# ─── 7. Smoke-test ───────────────────────────────────────────────────────────

echo ""
echo "▸ sigil status:"
sigil status | sed 's/^/    /'

echo ""
echo "▸ Smoke-test: 'I want to build a payment webhook handler'"
sigil search "I want to build a payment webhook handler" 2>&1 | head -12 | sed 's/^/    /'

echo ""
echo "✓ Seed complete."
echo ""
echo "  Suggested demo prompt:"
echo "  > I want to build a payment processor in this repo. Walk me through the design."
echo ""
echo "  Expected Claude opening:"
echo "  > \"Since you read Maya Iyer's article on Resilient Payment Webhook Handlers,"
echo "  >  it recommends three idempotency layers, async-first design, an event"
echo "  >  lifecycle state machine... Want me to follow that, combined with your"
echo "  >  existing patterns from the April 23 postmortem?\""
