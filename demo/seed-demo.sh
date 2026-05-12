#!/bin/bash
#
# Seeds Sigil v0.9.0 with a corpus that *feels like* accumulated memory:
# conversational `sigil remember` fragments + a small set of real
# artifacts (an ADR, a postmortem, a style guide, an article I read).
#
# What's new vs the 0.8.x seed:
#   - Migrations bring in pod / pod_membership / entity_hebbian_edge tables
#   - Person pods for Rohan (manager) + Maya Iyer (article author) are
#     created BEFORE ingest, so the entity-linker resolves their names
#     to canonical entities tied to those pods. Hot-context's 4 "person"
#     slots can then surface their facts in fresh sessions.
#
# What this is NOT: a handbook ingest. Earlier versions of this seed
# treated tech-stack docs and setup checklists as "memory," which made
# the demo land as "Claude has access to my docs" instead of "Claude
# remembers what I told it." The current corpus mirrors how real
# memory accumulates — short, voiced, in passing.
#
# What this script does:
#   1. Wipes ~/.sigil/db/ (preserves your .env and rotated API key)
#   2. Re-runs migrations (picks up v0.9.0 pod + entity-hebbian tables)
#   3. Creates person pods for Rohan + Maya Iyer (PR1 person pods)
#   4. Saves ~22 conversational preference / decision fragments
#   5. Ingests 5 real artifacts (2 ADRs, 1 postmortem, 1 style guide,
#      1 article the user read)
#   6. Records the reading-log fact ("I read [article]")
#   7. Refreshes the hot-context snapshot (pod-aware blend)
#   8. Smoke-tests the demo query + lists pods
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

echo "▸ Wiping data store (keeping .env and encryption key intact)..."
pkill -f "sigil/dist/server.js --mcp" 2>/dev/null || true
sleep 1

# Read DB type from the env so the wipe path matches the active backend.
# Pre-v0.9.0 ran on PGlite (file-based at ~/.sigil/db). v0.9.0+ may also run
# on real Postgres via SIGIL_DB_TYPE=postgres + SIGIL_DB_* settings.
DB_TYPE="$(grep -E '^SIGIL_DB_TYPE=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
DB_TYPE="${DB_TYPE:-pglite}"

if [ "$DB_TYPE" = "postgres" ]; then
  PG_HOST="$(grep -E '^SIGIL_DB_HOST=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
  PG_PORT="$(grep -E '^SIGIL_DB_PORT=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
  PG_NAME="$(grep -E '^SIGIL_DB_NAME=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
  PG_USER="$(grep -E '^SIGIL_DB_USER=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
  PG_PASS="$(grep -E '^SIGIL_DB_PASSWORD=' "$SIGIL_HOME/.env" | head -1 | cut -d= -f2)"
  echo "  → Postgres mode: wiping public schema in $PG_NAME @ $PG_HOST:$PG_PORT"

  # The app user (sigil_app) is not a superuser and cannot re-create the
  # `vector` extension after a schema-level wipe. We need a superuser. With
  # the embedded-pg lifecycle manager, the OS user is the cluster owner.
  SUPERUSER="${SIGIL_PG_SUPERUSER:-$USER}"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$SUPERUSER" -d "$PG_NAME" -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \
    -c 'CREATE EXTENSION IF NOT EXISTS vector;' \
    -c "GRANT ALL ON SCHEMA public TO $PG_USER;" >/dev/null
else
  rm -rf "$SIGIL_HOME/db"
fi

rm -f "$SIGIL_HOME/.hook-dedup.json" "$SIGIL_HOME/.stop-cursor.json" "$SIGIL_HOME/CLAUDE.md"

# Re-run migrations against the fresh DB.
echo "▸ Running migrations..."
sigil migrate >/dev/null

# ─── 2. Person pods — created BEFORE facts so entity-linker can match ────────
#
# In v0.9.0, person pods back canonical person entities. Creating them
# first means later facts that mention "Rohan" or "Maya Iyer" resolve
# (via Stage-1 exact name match in the entity resolver) to these
# canonical entities, and the entity-Hebbian gets clean co-retrieval
# edges instead of duplicate-person noise.

echo "▸ Creating person pods..."
sigil pod create --type=person --name="Rohan" \
  --role="Auth platform owner" \
  --relationship="peer" \
  --notes="Owns @platform/auth. Pair on anything auth-shaped." \
  >/dev/null
sigil pod create --type=person --name="Maya Iyer" \
  --role="Payments engineer, Hatch Engineering" \
  --relationship="external" \
  --notes="Author of the Resilient Payment Webhook Handlers article (April 28 2026)." \
  >/dev/null

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
echo "▸ sigil pod list:"
sigil pod list 2>&1 | head -10 | sed 's/^/    /'

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
