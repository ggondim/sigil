# Sigil Usability Baseline — 2026-05-18

Snapshot of Sigil's reliability + memory quality *before* the Week 1 hardening sprint. This is the before-shot we compare against at end of week.

## Headline numbers

| Metric | Value | Verdict |
|---|---:|---|
| Hook errors (last 7 days) | **163** | Catastrophic |
| Hook errors (last 24h) | 5 | Critical |
| Error rate per day (avg) | ~23 / day | Critical |
| % errors with category `config:wrong-model-for-provider` | **99%** (161/163) | Single root cause dominates |
| % errors silently swallowed (user never saw them) | **100%** | Every error rotted in `.hook-errors.log` |
| Session-end synthesis success rate | **0%** observed (May 13 session, 12 facts, no summary) | Broken |
| PostToolUse signal:noise ratio (estimated) | **~10:90** (1 useful : 9 noisy) | Heavy bias toward shell command captures |
| Cross-session memory (yesterday's summary surfaces today) | ❌ Not working | Synthesis never fired |
| Status file / proactive surfacing | ❌ Doesn't exist | Day 2 work |
| Hot-context refresh recency | ✅ Refreshed 2026-05-18 14:07 | Working |
| Vital facts quality (sampled top 20) | ✅ Mostly specific, useful | Stop classifier works well |
| Project / person / claude_session pod auto-creation | ⚠️ Works, but project pods get weird names when cwd is not a git root (e.g., `Projects` pod from opening CC in `~/Drive/Projects/`) | Edge-case gap |

## Error breakdown

```
By hook:
  user-prompt-submit      93 errors
  post-tool-use           68 errors
  stop                     2 errors
  session-end              0 errors  (because it silently no-ops, see below)

By root cause:
  config:wrong-model-for-provider  161
  unknown (OpenRouter 400)           2

By error message (top distinct):
  [121] OpenAI embed failed: 404 "The model `nomic-embed-text` does not exist or you do not have access to it"
  [ 40] Voyage embed failed: 400 "Model nomic-embed-text is not supported"
  [  2] OpenRouter error 400: "google/gemini-flash-latest is not a valid model ID"
```

## Root causes identified

### 1. Hook env-loading bug (FIXED 2026-05-18)

All 4 hooks had `if (local) load local; else if (global) load global`. The `else if` meant **if a project `.env` exists, the global `~/.sigil/.env` is NEVER loaded.** When CC runs in `~/Drive/Projects/cortex/`:

- Project `.env` loads → has `VOYAGE_API_KEY` but no `EMBEDDING_*` settings
- Global `~/.sigil/.env` (which sets `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=text-embedding-3-large`) is **skipped**
- `config.embedding.provider` is empty → auto-detection runs
- Auto-detect picks Voyage (because `VOYAGE_API_KEY` is set) or falls through to OpenAI
- `EMBEDDING_MODEL` defaults to `'nomic-embed-text'` (the Ollama default in `config.js`)
- Either provider returns 400/404 because `nomic-embed-text` isn't a valid model name there

**Fix:** Hooks now load BOTH env files (project first, global fills missing). Matches `src/cli.js` behavior. Committed in `src/hooks/{user-prompt-submit,stop,post-tool-use,session-end}.js`. `dist/` rebuilt.

### 2. Session-end synthesis silently fails

May 13 session pod: 12 facts attached, session ended at 13:26 with `attrs.summary: null` and `attrs.conclusion: null`. No `session_summary` fact created. The synthesizer ran (we know because the session pod has `ended_at` set, which is done by the same hook). But the LLM call either failed silently or never returned a usable summary.

Likely cause: same env-loading bug also affected the LLM provider selection for the synthesizer's `promptJson` call. Now that env loads correctly, this should fix itself for new sessions — but I need to verify.

**Verification needed:** End the next CC session and check whether a `session_summary` fact appears.

### 3. PostToolUse captures ~90% noise

Sampled 7 of 12 facts in the May 13 session pod — all 7 were raw Bash output captures like:

```
Ran: docker start logan-pg && sleep 3 && echo "" && echo "=== Status ===" && docker ps --filter…
Ran: for vol in 30c99aa221388a9f02fbbe540af377026ca4dbd470b7cf7de73ca198a7627873 \
     e81b9b...
```

These are one-shot infrastructure commands. Zero reuse value in a future session. The current PostToolUse filter blacklists Read/Glob/Grep/etc. but lets every Bash command through with no quality gate.

**Fix path:** Day 3 work. Either (a) tighten the Bash filter to skip docker/shell-plumbing commands, (b) downgrade Bash observations to `importance=1` so they decay fast, or (c) add an LLM gate that decides "is this Bash command worth remembering?" — costs more but quality is much higher.

### 4. OpenRouter model ID `google/gemini-flash-latest` returns 400

Two errors in last 24h. The pricing list showed this as a valid model, but OpenRouter's runtime model registry rejects it as "not a valid model ID." Likely the `:latest` alias isn't allowed; need a pinned form like `google/gemini-2.5-flash`. Tracked as task #39.

### 5. Status file proactive surfacing doesn't exist

Hook errors rot silently in `.hook-errors.log`. `sigil doctor` surfaces them only when manually invoked. No notification, no CLI warning. Day 2 work.

## What's working

- **Vital fact extraction** (Stop classifier) — Sampled facts are mostly specific and useful (e.g., "Hand-picked timestamps for migration files can clash with concurrent migrations or land out of order", "Never hand-write a migration file with a guessed timestamp"). The classifier prompt is doing its job.
- **Pod auto-creation** — claude_session, project, person pods all materialize correctly on hook fires.
- **Hot-context refresh** — `~/.sigil/CLAUDE.md` is fresh (refreshed 2026-05-18 14:07).
- **Person pod accumulation** — Maya Iyer pod has 6 facts attached, all from organic mentions across sessions. Working as designed.

## What's broken (in priority order)

1. ~~**Hook env-loading**~~ → Fixed 2026-05-18
2. **Session-end synthesis** — needs verification after env-loading fix; tracking as #4 of week plan
3. **PostToolUse noise** — Day 3 quality work
4. **No proactive error surfacing** — Day 2 work (status file + sigil doctor budget)
5. **No config validator** — Day 2 work (would have caught the env-loading symptom)
6. **No retry on transient errors** — Day 2 work
7. **OpenRouter model ID issue** — separate task #39
8. **Project pod gets weird name when cwd is non-repo parent dir** — known edge case, not blocking

## End-of-week success criteria

- Hook error rate down from 23/day → **<2/day** (target: 0/day for 48h straight)
- Session-end synthesis success rate from 0% → **≥80%** (verified across 3+ real sessions)
- `sigil doctor` would have caught the env-loading symptom **before** errors started piling
- Status file flips red within 3 hook failures, CLI surfaces it on next invocation
- Sampled session pod facts: signal:noise improves from 1:9 → at least 1:3
- Subjective: open CC tomorrow morning, ask a question from yesterday's session, Sigil's injection makes Claude answer correctly without re-explanation

## Methodology

- Hook error log analyzed via `~/.sigil/.hook-errors.log` (163 lines, May 14–18).
- Pod / fact audit via `sigil pod list --kind=claude_session --limit=15`, `sigil pod show <uid>`, `sigil facts | head -30`.
- Config inspection via `grep -E '^(EMBEDDING|LLM_|...)' ~/.sigil/.env` and the cortex project `.env`.
- Env-loading verification via a standalone Node script that mimics the hook's dotenv calls.

## Run metadata

- **Date:** 2026-05-18
- **Sigil version:** v0.10.0 + uncommitted hook env-loading fix
- **CC active session:** `5d7a78eb-89df-415a-aa00-7e4ccf9186e3` (this one)
- **Files inspected:**
  - `~/.sigil/.hook-errors.log` (163 lines)
  - `~/.sigil/.env`, `~/Drive/Projects/cortex/.env`
  - `src/hooks/*.js` (env-loading code)
  - 3 claude_session pods (latest), 1 person pod, 2 project pods
