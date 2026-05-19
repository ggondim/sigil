# Changelog

All notable changes to `@anmolsrv/sigil`.

## 0.10.0 — 2026-05-19

A substantial release. Three themes:

1. **Pod distinction layer** — `session`/`person`/etc. become registry-driven *kinds* with declared retrieval behaviour, schema docs, and TTLs.
2. **Postgres-only backend** (breaking) — PGlite is dropped from runtime; Sigil now requires Postgres + pgvector. `sigil init` auto-bootstraps the database, user, and extension if you don't have them yet.
3. **Provider + hook hardening** — OpenRouter as a first-class LLM provider, a config validator that catches mismatches before they fail silently, hook error budget surfaced by `sigil doctor`, and a critical env-loading bug fix.

### ⚠ Breaking changes

- **PGlite is no longer supported.** `SIGIL_DB_TYPE=pglite` (the old default) now throws at startup with a migration message. Existing PGlite data at `~/.sigil/db/` is preserved on disk but unreachable from this version. See [Notes for upgraders](#notes-for-upgraders) below.
- **`sigil doctor --kill-stale` removed.** It was PGlite-specific; nothing to clean up for Postgres.
- **`types/` import paths removed.** Code importing from `src/memory/pods/types/session.js` or `types/person.js` must move to `kinds/claude_session.js` / `kinds/person.js`.
- **Renamed pod type**: existing `pod_type='session'` rows are rewritten to `'claude_session'` by the migration.

### Pod distinction layer

Pod *types* (a hardcoded enum: `session | person | project | connector_workspace | custom`) become **pod kinds** — a declarative registry that any new kind plugs into. New kinds are no longer a schema change; they're a contract file. Hot-context, search, hooks, and CLI all delegate to the registry instead of branching on a fixed list.

**Five built-in kinds (Claude Code-focused):**

- `claude_session` (singleton-live, 6 hot-context slots, 90-day TTL) — replaces the old `session` type. The 0.10.0 migration rewrites existing `pod_type='session'` rows to `'claude_session'`.
- `project` (multi-active, 4 slots, no TTL) — derived from `git rev-parse --show-toplevel` (or cwd if not a git repo); abs path is the identity. Multiple project pods can be active simultaneously across open editors.
- `person` (rolling-24h, 4 slots, no TTL) — existing person type, now with the full kind contract.
- `playbook` (always-active per project, 3 slots, no TTL) — **new procedural-memory kind** (the CoALA gap). User-authored workflows / debug recipes / runbooks; surfaces in hot-context for sessions whose project matches the playbook's `attrs.project`.
- `vital` (virtual, 6 slots) — surfaces facts marked `importance=5` globally, regardless of pod membership. Preserves pre-0.10 vital-facts behavior through the new kind contract.

(`codex_session` and `agent` kinds land in 0.11.0.)

### Each kind ships a markdown schema doc

Karpathy's "third layer" — every built-in kind has a `<name>.schema.md` next to its contract that tells the LLM how to author/update facts for that kind. User overrides at `~/.sigil/schemas/<kind>.md`. The fact extractor reads the relevant schema before producing facts.

### Append-only foundations

Three new `fact` columns lay the groundwork for the bi-temporal arbiter that lands in 0.11.0:

- `importance_score INTEGER` — 1–5 numeric, backfilled from the existing text `importance` (vital→5, high→4, medium→3, supplementary→2, trivial→1). Hot-context now ranks by `importance_score DESC`, then recency — Karpathy's "distraction" failure mode (stale memories surfacing forever) gets the importance-weighted antidote.
- `superseded_at TIMESTAMP` + `superseded_by_fact_uid TEXT` — Graphiti-style supersession columns. Wired but unused in 0.10.0; the conflict-arbiter that populates them ships in 0.11.0.

Existing `valid_from` / `valid_until` already cover event-time validity; no new columns needed there.

### Kind-driven retrieval

- **Hot-context** rewritten as a registry iteration. The hardcoded four-pass blend disappears; each active kind contributes facts up to its declared `hotContextBudget`, virtual kinds (vital) use a custom `fetchFacts` method, pod-backed kinds default to the shared `factsInPodsByRecency` helper.
- **`hybridSearchFacts`** accepts `podIds: number[]` — when set, an EXISTS subquery against `pod_membership` scopes both semantic and keyword CTEs.
- **`search()`** in hybrid.js accepts `podScope`: `null`/`'global'` for full brain, `'auto'` to resolve via `registry.activeKinds(ctx)`, or an explicit pod-name/uid list. MCP `search` tool exposes the parameter so external callers can scope.

### Hooks delegate to active kinds

New `src/memory/pods/hook-dispatcher.js` — the single seam every hook calls. Walks the registry, opens/refreshes pods for every kind whose lifecycle fires on the hook event, and returns the flat pod-uid list to attach to. Result: a fact saved during a Claude Code session auto-attaches to BOTH the `claude_session` pod AND the active `project` pod, with zero per-kind hook code.

### UserPromptSubmit injection: smarter

- Query router (`src/memory/cognitive/query-router.js`) turned ON (was bypassed) — query intent classifies categories, expand, useGraph.
- `podScope: 'auto'` — pod-tiered injection (session → project → person → vital) with `'global'` fallback for fresh installs.
- Token budget (`INJECTION_BUDGET_CHARS=4800` ≈ 1200 tokens) replaces the fixed `MAX_FACTS=8`.

### Session-end synthesizes a durable summary

When a Claude Code session ends, the hook gathers facts attached to the session pod, calls the LLM with `claude_session.schema.md` as system context, and emits one summary fact (60–220 chars). The synthesized fact attaches to BOTH the closing session pod (ephemeral, decays) AND the project pod (durable) via the dispatcher. Cross-session memory: tomorrow's session in the same project sees today's distilled summary.

### Observability

- `sigil why "<query>"` — runs the same hybrid search the UserPromptSubmit hook uses and prints per-fact RRF / pod / kind / importance breakdown. The "why is this fact in my context?" tool.
- `sigil kind list` / `sigil kind show <name>` — inspect registered kinds, their budgets, visibility, TTL, schema doc.
- `sigil context --explain` — instead of writing the snapshot, print the kind-by-kind blend that would be written.
- `sigil doctor` now surfaces the last 5 hook errors from `~/.sigil/.hook-errors.log`. Hooks never block Claude, so silent rot was the pre-0.10 failure mode; this is the cure.

### Postgres-only backend (replaces PGlite)

`config.db.type` defaults to `postgres`. If `SIGIL_DB_TYPE=pglite` is set anywhere, startup throws a clear error with the migration path.

  - `src/db/cortex.js` and `knexfile.js` drop the conditional; always `pg` client.
  - `src/db/setup.js` (new) — admin-credentials-once bootstrap: `CREATE DATABASE`, `CREATE USER` (or `ALTER USER` if exists), `GRANT ALL PRIVILEGES`, `CREATE EXTENSION vector`. Idempotent. Validates SQL identifiers strictly. Helpful error if pgvector isn't installed at the Postgres server level.
  - `sigil init` gains a Postgres connection section: prompts for host, port, db, user, password (sensible defaults), probes the connection, asks once for admin credentials only if the bootstrap is needed.
  - `@electric-sql/pglite` moved from `dependencies` to `devDependencies` — still used by the entity-Hebbian integration test as an in-memory test fixture for SQL portability checks. Never on the runtime path.

### OpenRouter LLM provider

New first-class provider — one API key, many models (Anthropic, OpenAI, Meta, Google, Mistral, ...).

  - `src/lib/llm/providers/openrouter.js` — OpenAI-compatible chat endpoint.
  - `sigil init` adds OpenRouter to the provider select with an opt-in "Advanced overrides" step that pre-fills the smart-split (cheap qwen for extraction, Sonnet for AUDM decision + synthesis).
  - Default singular model: `google/gemini-flash-latest` — best balance of price ($0.0005/$0.003 per 1M), context (1M), JSON output reliability, and latency (~500ms) at the time of release.
  - `sigil doctor` recognises and reports the OpenRouter model.

### Hook reliability (the silent-failure cure)

The audit found 161 hook failures over 7 days, 99% from a single root cause. Fixed and instrumented:

  - **Critical env-loading bug.** All 4 hooks had `if (local) load local; else if (global) load global` — meaning any project `.env` completely shadowed the global `~/.sigil/.env`. Fixed: load both, project first, global fills missing keys. Matches the long-standing CLI behaviour.
  - **`src/lib/config-validator.js`** (new) — regex-based detection of known-wrong provider/model combinations (e.g., `EMBEDDING_PROVIDER=voyage` + `EMBEDDING_MODEL=nomic-embed-text`). Runs in `sigil doctor` (surfaces with fix command) and as a fail-closed gate in every hook (logs to error log, skips the doomed API call).
  - **`src/hooks/error-log.js`** — append-only diagnostic log at `~/.sigil/.hook-errors.log`. `getUnackedErrorCount()` counts errors since the last clean `sigil doctor` run; `markDoctorClean()` stamps the ack file. `failClosedOnBadConfig()` is the shared hook entry-point gate.
  - **Proactive warning** — every CLI command (except doctor/export/register) prints a one-line stderr warning if there are unacked hook errors: `⚠ Sigil: N unacked hook errors — run \`sigil doctor\` for details`.
  - **Hook-error budget in doctor** — >5 unacked errors flips the doctor row from `warn` to `fail` with exit code 1, so CI / scripts can catch it.
  - **`src/hooks/env-loader.js`** (new) — shared `loadHookEnv()` helper. The 6 duplicated lines that previously lived in each hook are now one import.

### Init UX

  - **Fixed the clobber bug.** Re-running `sigil init` used to silently drop keys it didn't prompt for (custom env vars, DB settings, `SIGIL_SYNTH_MODEL`, etc.). Now init reads the existing `.env`, overlays the new prompted values on top, and writes the union. Existing customisations survive.
  - **Hook registration dedup** — the filter that recognises prior Sigil hooks was string-matching on `'sigil'` AND `'hooks'` in the command path. Install paths like `/Users/.../cortex/dist/hooks/` failed both halves, so every re-run of init appended a duplicate hook entry. Replaced with a filename-based match (`stop.js`, `user-prompt-submit.js`, etc.). Robust against any install path.
  - **Stop hook detection** — the same string-match bug also produced false-negatives in doctor's "Stop hook registered" check. Fixed.

### Observability

- `sigil why "<query>"` — runs the same hybrid search the UserPromptSubmit hook uses and prints per-fact RRF / pod / kind / importance breakdown. The "why is this fact in my context?" tool.
- `sigil kind list` / `sigil kind show <name>` — inspect registered kinds, their budgets, visibility, TTL, schema doc.
- `sigil context --explain` — instead of writing the snapshot, print the kind-by-kind blend that would be written.
- `sigil doctor` now also surfaces the last 5 hook errors with category counts. Exit code 1 on unacked-error-budget breach.

### Internal refactor (Tier 1 audit cleanups)

  - `src/lib/paths.js` centralises ~12 path constants: `SIGIL_HOME`, `SIGIL_ENV_PATH`, `SIGIL_DB_PATH`, `SIGIL_MD_PATH`, `SIGIL_HOOK_ERRORS_LOG`, `SIGIL_LAST_CLEAN_DOCTOR`, `SIGIL_ACTIVE_SESSION_CURSOR`, `SIGIL_STOP_CURSOR`, `SIGIL_HOOK_DEDUP`, `SIGIL_SCHEMAS_DIR`, `CLAUDE_SETTINGS_PATH`, `CLAUDE_MD_PATH`. ~20 hardcoded `join(homedir(), '.sigil', ...)` strings collapsed.
  - Pruned unused imports across all 4 hooks after the env-loader extraction.

### Notes for upgraders

**From 0.9.x (the breaking part):**

- Sigil 0.10.0 requires Postgres + pgvector. Easiest: `docker run -d --name sigil-pg -p 5432:5432 -e POSTGRES_PASSWORD=sigil_dev pgvector/pgvector:pg15`.
- Run `sigil init` once after upgrading. It will detect that the `sigil` database doesn't exist on your fresh Postgres, ask for admin credentials once, bootstrap the DB + user + pgvector extension, then run migrations. Admin creds are used only during the bootstrap call and never written to disk.
- Your old PGlite data at `~/.sigil/db/` is preserved untouched. v0.10.0 doesn't read from it. If you need to migrate old facts, see [MIGRATING.md](./MIGRATING.md) (export from PGlite → re-ingest into Postgres).
- The pod-type rewrite (`session` → `claude_session`) and the three new `fact` columns (`importance_score`, `superseded_at`, `superseded_by_fact_uid`) run automatically on the first migration against your fresh Postgres. Reversible via `sigil migrate --rollback`.

**Code-level (only relevant if you import from Sigil internals):**

- `src/memory/pods/types/` is gone — replaced by `src/memory/pods/kinds/`.
- `pglite-adapter.js` stays in the repo (test fixture) but is never imported by runtime code.

**Deferred to 0.11.0+:**

- `codex_session` + `agent` kinds, API-key identity, attribution tuple, three-primitive write API, ACLs, JS SDK, runtime kind registration, MCP daemon / SSE transport, connector packages, reference agents.

## 0.9.0 — 2026-05-12

### Added — typed memory pods

Pods are typed memory containers (`session`, `person`, `project`,
`connector_workspace`, `custom`) that segregate facts, documents, and entities
by source or subject. They sit on top of the existing fact/entity/document
model — AUDM, fact extraction, entity dedup, and namespaces are unchanged.

**Schema**
- New `pod` table with `pod_type` discriminator + `attrs` jsonb. Partial-unique
  on `(pod_type, external_id, namespace)` for idempotent upserts.
- New `pod_membership` polymorphic junction (`fact` | `document` | `entity`).
  Many-to-many so a fact can live in both a session pod and a person pod.
- `document.source_metadata` jsonb + `connection_id` FK so the ingest pipeline
  finally persists the metadata it previously dropped.

**Pipeline**
- `ingestDocument()` accepts optional `podUids: string[]` and
  `resolvePodsFrom: 'metadata'` for connector-derived attachment.
- Facts inherit their document's pod set automatically (thought fast-path
  and main path).
- Entity merger reassigns `pod.entity_id` from duplicate → primary on merge,
  archiving the duplicate's pod if the primary already has one.

**Hooks**
- `stop.js` and `post-tool-use.js` read `session_id` from the Claude Code
  hook envelope, ensure a session pod via `~/.sigil/.active-session.json`,
  and attach extracted facts.
- New `SessionEnd` hook closes the active session pod and writes
  `attrs.conclusion` if Claude provided one.

**Hot-context**
- `getHotFacts()` becomes a four-pass blend: 6 slots for the active session
  pod, 4 for person pods touched in the last 24h, 8 for global vital facts,
  2 reserved for project pods. Falls back to recency for installs without
  pods.

**CLI**
- `sigil session current | list | show` — inspect the active session pod.
- `sigil pod list | show | create | archive | delete` — manage pods.
  `sigil pod create --type=person --name="…" --slack=U… [--github=…]
  [--email=…] [--role="…"]` creates a person pod and its canonical entity.

**MCP tools**
- `list_pods(type?, namespace?, status?, limit?)`
- `get_pod(uid)` — pod metadata + up to 20 member facts + 10 member documents.

### Added — entity-level Hebbian co-retrieval edges

Sibling of fact-level Hebbian, working at the entity layer so the learned
graph survives paraphrase and AUDM fact splits.

- New `entity_hebbian_edge` migration with `strength NUMERIC`, lex canonical
  order, indexes on both endpoints.
- Capped increment update (`LEAST(strength + eta, cap)`) on write; lazy
  exponential decay (`lambda = ln2 / halfLifeDays`) computed in SQL on read
  — no background decay job.
- Fire-and-forget write integration from hybrid search, bounded by
  `config.hebbian.entity.maxWriteEntities`.
- Read integration: third RRF signal via `applyCoRetrievalBoost` + graph
  expansion via `expandWithCoRetrievedEntities` widens the seed entity set
  for `useGraph` traversals.
- Hybrid search tests now mock `llm.js`, so the 51-test suite runs in
  ~300ms instead of ~32s.

### Migration notes

Three new migrations land in `0.9.0`:
- `20260512120000_create-pod-tables.cjs`
- `20260512120000_create-entity-hebbian-edge.cjs` (same timestamp prefix,
  different filename — Knex orders by full name, no conflict)
- `20260512120100_create-pod-membership.cjs`
- `20260512120200_add-document-source-metadata.cjs`

All additive. Existing data needs no backfill — pod_membership starts
empty and NULL membership means "global namespace knowledge" (same mental
model as today).

Run `sigil migrate` after upgrading, then `sigil init` to register the
new `SessionEnd` hook.

## 0.8.x

See git history for prior releases.
