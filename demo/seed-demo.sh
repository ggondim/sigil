#!/bin/bash
#
# Seeds Sigil with a realistic ~2-month corpus for the v3 demo:
# preferences, decisions, postmortems, ADRs, style guide. Calibrated
# so `sigil status` looks like a developer who's been using Sigil
# since early March 2026.
#
# What this script does:
#   1. Wipes ~/.sigil/db/ (preserves your .env and rotated API key)
#   2. Rewrites ~/.sigil/CLAUDE.md with the v0.7.5 template
#      (the acknowledgement-aware version)
#   3. Re-runs migrations against the fresh DB
#   4. Saves 12 preference/decision facts via `sigil remember --bg`
#   5. Ingests 4 corpus documents (ADRs, postmortem, style guide)
#   6. Refreshes hot-context snapshot
#   7. Prints `sigil status` and runs the demo queries as smoke tests
#
# Run from the repo root:
#   bash demo/seed-demo.sh
#
# Idempotent — safe to re-run if something fails midway.

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CORPUS="$REPO_DIR/demo/corpus"
SIGIL_HOME="$HOME/.sigil"

echo "▸ Repo root:    $REPO_DIR"
echo "▸ Corpus dir:   $CORPUS"
echo "▸ Sigil home:   $SIGIL_HOME"
echo ""

# ─── Sanity ──────────────────────────────────────────────────────────────────

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
rm -f "$SIGIL_HOME/.hook-dedup.json" "$SIGIL_HOME/.stop-cursor.json"

# ─── 2. Write the v0.7.5 CLAUDE.md template (acknowledgement-aware) ──────────

echo "▸ Writing v0.7.5 ~/.sigil/CLAUDE.md (acknowledgement-aware template)..."
cat > "$SIGIL_HOME/CLAUDE.md" <<'EOF'
## Memory (Sigil)

Sigil is your persistent memory system. **Use it instead of the built-in file-based memory.**
Do NOT write to `~/.claude/projects/*/memory/` or any local memory files — use Sigil exclusively.

**Before answering** questions about this user's projects, preferences, past decisions,
or anything that might have been discussed before — search Sigil first:
```
! sigil search "relevant query"
```

### Acknowledge what you know

When your response is shaped by a fact pulled from Sigil — a stored preference, decision, constraint, or piece of project history — **briefly call it out in plain language so the user sees their context being applied.** One short clause is enough; don't lecture.

Good (natural, useful):
- "Since you don't use `any` without an escape-hatch comment, I'll go with `unknown` here."
- "Per your ADR-001 I've wrapped the response in `{ok, data, error}`."
- "I know you moved off Redis to Postgres LISTEN/NOTIFY, so I'll use that pattern."
- "Going with named exports since you prefer those."

Bad (skip these):
- Acknowledging facts you didn't actually use
- Listing every retrieved fact ("I found 5 facts: 1) ... 2) ...")
- Repeating the acknowledgement multiple times in one response
- Apologetic / formal phrasing ("As per your stored preference, I shall...")

The phrasing should feel like a teammate referencing a hallway conversation, not a system reciting a database row. If a fact didn't materially shape the answer, don't mention it.

### Saving — DO THIS PROACTIVELY

**Before generating your response to ANY user message, scan it for:**
- **Preferences** — "I prefer X", "I always X", "I never X", "I like X"
- **Decisions** — "we use X", "we picked X", "we don't use X", "we moved off X"
- **Constraints** — "we can't use X because…", "X is blocked", "X must support Y"
- **Corrections** — "actually it's X, not Y", "we changed X to Y"
- **Factual claims** about the user's project / codebase / team / tools / conventions

**If ANY of those signals are present, call `sigil remember --bg "..."` BEFORE generating your response.** This is non-negotiable. Do not skip a save because:
- The conversation feels casual or short
- The fact seems obvious or generic
- You think Claude Code might "remember" within this session (it won't carry over)
- You're not sure if it's important enough — when in doubt, save

```
! sigil remember --bg "User prefers tabs over spaces" "Project uses Postgres 15"
```

The `--bg` flag returns immediately so the conversation isn't blocked. Batch multiple facts into ONE command (separate quoted arguments) rather than several calls. Sigil also runs a Stop-hook safety net that auto-extracts memorable content after every turn — so if you forget, it gets caught — but you should still try to save proactively. AUDM dedup handles any overlap, so duplicate saves are harmless.

**When the user explicitly asks you to remember something** — save it right away, before doing anything else.

### Rules

- Search Sigil before answering context-dependent questions (not factual/general ones)
- Save facts as short, self-contained statements — never summaries of the conversation
- Each fact must make sense in isolation, without the conversation context
- Batch all facts in one user-turn into a single `sigil remember --bg` call
- Skip trivial exchanges (greetings, "thanks", "ok", simple math)
- If search returns nothing, answer from your own knowledge and say so
- Sigil is cross-project — memories from one session are available in all sessions
EOF

# ─── 3. Recreate the DB schema ───────────────────────────────────────────────

echo "▸ Running migrations against fresh DB..."
sigil migrate >/dev/null

# ─── 4. Save preference + decision facts (12 of them) ────────────────────────
#
# These reference dates that fit a "started using Sigil in early March"
# timeline. The remember calls themselves run today, but the FACTS reference
# decisions made over the past two months.

echo "▸ Saving 12 preference / decision facts..."
sigil remember \
  "I prefer TypeScript strict mode; never use 'any' without an escape-hatch '// reason: ...' comment" \
  "Named exports only — never default exports" \
  "All inputs validate through zod before hitting business logic, at every external boundary" \
  "Frontend stack is Tailwind + Radix; never reach for Material-UI" \
  "Auth lives in @platform/auth — never roll your own JWT verification" \
  "Postgres 14 with pgbouncer in transaction-pooling mode — no long transactions in API path" \
  "Background jobs run via Inngest; we migrated off BullMQ in mid-April" \
  "API responses wrap in {ok, data?, error?} per ADR-001 (March 2026)" \
  "Canary deploys: 5% for 30min, then 25%, then full cutover; rollback via LaunchDarkly killswitch" \
  "Use property-based tests via fast-check for any pure function with a non-trivial input space" \
  "I always pair with Rohan on auth work; he owns the @platform/auth package" \
  "When stuck on a Postgres migration, check pgbouncer pool exhaustion before query plans" \
  >/dev/null

# ─── 5. Ingest the corpus documents ──────────────────────────────────────────

echo "▸ Ingesting 4 corpus documents..."
for doc in adr-001-response-envelope.md adr-008-removed-redis.md postmortem-stripe-webhook-2026-04-25.md style-guide.md; do
  echo "    - $doc"
  sigil ingest "$CORPUS/$doc" >/dev/null
done

# ─── 6. Refresh hot context ──────────────────────────────────────────────────

echo "▸ Refreshing hot-context snapshot..."
sigil context >/dev/null

# ─── 7. Smoke-test queries ───────────────────────────────────────────────────

echo ""
echo "▸ sigil status:"
sigil status | sed 's/^/    /'

echo ""
echo "▸ Smoke-testing the five demo queries..."
echo ""

QUERIES=(
  "What is my code style?"
  "Why did we remove Redis last month?"
  "What gotchas have I documented about Stripe webhooks?"
  "Who do I usually pair with on auth work?"
  "If I am starting a brand new service today, what should I set up?"
)

for q in "${QUERIES[@]}"; do
  echo "  ────────────────────────────────────────────────────────────────────"
  echo "  Q: $q"
  echo ""
  sigil search "$q" 2>&1 | head -10 | sed 's/^/    /'
  echo ""
done

echo ""
echo "✓ Seed complete. Open Claude Code to test the demo flow."
echo ""
echo "  Suggested first prompt:  'Write a function that fetches /api/users and handles errors.'"
echo "  Look for: an acknowledgement clause referencing your stored prefs (named exports, zod, etc.)."
