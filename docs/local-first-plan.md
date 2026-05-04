# Cortex Local-First Plan (with optional API support)

Drafted 2026-05-04 after PGlite hit its concurrency wall in real usage. Decision finalized: bundled embedded Postgres (with pgvector) replaces PGlite as the storage floor.

## What we learned

PGlite is single-connection. Two failure modes show up in normal Cortex usage:

1. **Multi-process collision.** Each Claude Code session spawns its own MCP server. A user with three terminals open has three MCP servers each holding the DB. Adding a CLI invocation makes four. PGlite errors out.
2. **Single-process race.** Inside one process, `logCall` fires-and-forgets writes to `llm_log` while the pipeline runs synchronous writes to `document` / `chunk` / `fact`. PGlite's WASM aborts under concurrent writes even with a single connection pool.

PGlite is fine for single-dev / single-terminal / light usage. It's not enough for the actual Cortex usage pattern (hooks per prompt, MCP servers in multiple sessions, eval harnesses). We need a sturdier local floor that doesn't compromise feature parity.

## Storage decision: bundled embedded Postgres + pgvector

Rejected paths and why:

| Path | Why rejected |
|---|---|
| PGlite + daemon broker | Adds daemon lifecycle complexity; PGlite WASM brittleness on hard kills survives. Doesn't solve recovery, just hides the symptom. |
| Docker Postgres | "You need Docker" instantly torches the local-first / zero-install pitch. |
| SQLite + sqlite-vec migration | ~2 weeks of rewrites for partial feature parity. Loses pgvector HNSW + halfvec + jsonb + ts_rank, all of which Cortex's eval/architecture work depends on. |
| Native Postgres install | Platform-specific, manual, defeats zero-install. |
| Hosted SaaS | Explicit non-goal — Cortex is a personal tool. |

**Chosen:** bundle a Postgres binary + pgvector extension inside the npm package. Cortex spawns it as a managed child process on first use. Real Postgres semantics, real concurrency, full feature parity, zero Docker.

This is the most engineering work of the options but the only one that preserves every existing capability (HNSW indexes, halfvec compression, ACT-R activation in single-CTE RRF, AUDM transaction with `SET LOCAL hnsw.ef_search`, recursive CTEs for graph traversal, jsonb for metadata, FULL OUTER JOIN, ts_rank).

## Architecture

```
~/.cortex/
├── pg/                          # bundled Postgres binary + pgvector .so/.dylib/.dll
│   ├── bin/postgres
│   ├── lib/postgresql/
│   │   ├── pgvector.so
│   │   └── ...
│   └── share/
├── data/                        # the actual Postgres data dir (initdb output)
│   ├── pg_wal/
│   ├── base/
│   └── ...
├── pg.sock                      # Unix socket for local connections
├── pg.pid                       # managed process PID file
├── .env                         # cortex config (CORTEX_DB_HOST=local socket etc.)
└── CLAUDE.md
```

**Lifecycle:**
- `cortex` is the only process that starts/stops Postgres. CLI commands check the PID file; if Postgres isn't running, they spawn it (~500ms cold start), connect, run their work, exit. Postgres keeps running for next call.
- Idle-shutdown after 30 minutes of no connections.
- `cortex stop-db` / `cortex start-db` for explicit control.
- On crash, next cortex command detects stale PID, runs `pg_resetwal` if needed (real Postgres has the tools), restarts.

**Connection model:** Unix socket (no TCP port collisions, faster, simpler). Falls back to TCP on Windows where Unix sockets aren't universal — uses an unused high port (random above 49152) and writes it to the PID file.

## What gets shipped

### npm package layout

The npm package itself stays small (~5-10MB). A **postinstall hook** detects platform + arch and downloads the matching Postgres+pgvector bundle from a Cortex GitHub release (~40-60MB). One-time download, cached at `~/.cortex/pg/`.

### Build pipeline

GitHub Actions matrix produces 5 binary bundles per Cortex release:

| Target | Bundle | Notes |
|---|---|---|
| macOS arm64 | postgres-17 + pgvector.dylib | Code-signed + notarized |
| macOS x64 | postgres-17 + pgvector.dylib | Code-signed + notarized |
| Linux x64 | postgres-17 + pgvector.so | Static-linked where possible |
| Linux arm64 | postgres-17 + pgvector.so | Static-linked where possible |
| Windows x64 | postgres-17 + pgvector.dll | Authenticode-signed |

Postgres binary sourced via the `embedded-postgres` npm package (which wraps the official EnterpriseDB downloads). pgvector compiled from source against pinned Postgres version in CI.

### Pinned versions

- **Postgres 17.x** — matches the user's existing `pgvector/pgvector:pg17` Docker container, ensures no schema surprises. We follow Postgres minor version updates intentionally, not auto.
- **pgvector 0.8.x** — current stable.
- Both pinned in `package.json` and the build pipeline. Updates require explicit version bumps + regression test.

## Phase plan

### Phase A — Build pipeline (4-6 days)

1. GitHub Actions matrix: Postgres 17 download + pgvector compile, per platform.
2. Code-signing setup: Apple Developer ID + Microsoft Authenticode. Recurring secret: ~$100/year for Apple, ~$200-400/year for Authenticode (or use SignPath's free open-source program).
3. Release artifact format: `cortex-pg-{platform}-{arch}-{cortex-version}.tar.gz` with checksum.
4. Smoke test in CI: each artifact starts, accepts a `SELECT 1`, accepts a `CREATE EXTENSION vector`, runs all Cortex migrations.

### Phase B — Embedded Postgres lifecycle manager (3-4 days)

1. New `src/db/embedded-pg.js`:
   - `start()`: detect installed binaries, spawn Postgres on a Unix socket, wait for ready.
   - `stop()`: graceful SIGTERM, fall back to SIGKILL after 5s.
   - `health()`: PID-alive check + `pg_isready`.
   - `idle-shutdown()`: tracked via last-connection timestamp, cron-style sweep.
   - `recover()`: on stale PID detected, run `pg_resetwal` if WAL is recoverable, else clean restart.
2. Knex client switches from `ClientPGlite` → standard `pg` client connecting via Unix socket.
3. Handle Windows fallback (TCP on random high port).

### Phase C — `cortex init` upgrade (2 days)

1. Postinstall: download platform-matched binaries with progress bar ("Downloading Postgres+pgvector for macOS arm64 — 47MB"). Verify checksum against released SHA256.
2. `cortex init`:
   - Generate random superuser password (stored in `~/.cortex/.env`, mode 600).
   - `initdb` to create `~/.cortex/data/`.
   - Start Postgres, create `cortex` database, load pgvector extension.
   - Run `cortex migrate` against the new instance.
3. Migration path for existing PGlite users: detect `~/.cortex/db/`, offer either "skip (start fresh)" or "attempt salvage via `cortex export`" (best-effort — PGlite data may already be unrecoverable).

### Phase D — `cortex doctor` + lifecycle commands (1 day)

1. `cortex doctor` checks: bundle present, binaries executable, Postgres running, pgvector loaded, WAL clean, schema version current.
2. `cortex start-db` / `cortex stop-db` / `cortex restart-db` — explicit lifecycle.
3. `cortex doctor --reinstall-pg` — re-download bundles if corrupted.

### Phase E — Distribution polish (1-2 days)

1. README: update install instructions (`npm install -g @anmolsrv/cortex` then `cortex init`). Note one-time ~50MB download.
2. Provider picker at `cortex init` (Phase 3 of original plan).
3. 30-second demo video — now uses real Postgres under the hood, no functional change to the demo.

### Total: ~3-4 weeks of focused work to v0.5

## API provider integration (independent of storage)

Storage decision and API provider decisions are orthogonal. The provider picker stays the same regardless of backend:

- **Best free local**: Ollama nomic + claude-cli (current default)
- **Best free quality**: Ollama bge-large-en-v1.5 (1024d) + claude-cli + opt-in OpenAI key for synth
- **Best paid**: Voyage `voyage-3-large` + Anthropic Haiku/Sonnet
- **Mixed**: per-stage selection

`cortex init` picker writes the right env vars + runs migrations with the right `EMBEDDING_DIMENSIONS` so the schema and embedder match.

Per-provider connectivity tests run during init — Voyage rate limit, OpenAI 401, Anthropic auth — caught upfront, not mid-pipeline.

## What gets dropped after embedded Postgres lands

- `cortex doctor --kill-stale` — PGlite-specific lock cleaner, irrelevant on real Postgres
- The `Aborted()` error wrapper in cli.js — replaced with Postgres-aware error handling
- The PGlite-specific docstrings in migrations — updated to reflect "real Postgres, sqlite-vec free, pgvector with halfvec"

## What stays unchanged

- All existing schema and migrations (real Postgres = same SQL works)
- All retrieval logic (single-CTE RRF, ACT-R activation, Hebbian edges, lifecycle stages)
- All embedding/LLM provider plumbing
- All eval methodology (`eval/longmemeval/`)
- Brand and design system

## Branch strategy

- **`master`** — recipient of the merged `improvements` branch (Voyage embedder, ACT-R, Hebbian, lifecycle, AUDM tightening, `source_path` namespace fix, doctor `--kill-stale`, env loader fix, conditional dim migration, RESULTS.md, this plan).
- **`embedded-postgres`** — new branch off `master`. All Phase A-E work lands here. Single PR when complete; eval baseline (R@10 = 100%) reproduced before merge.

## Out of scope for this plan

- Hosted/SaaS Cortex (deferred — explicit non-goal for now).
- SQLite migration (rejected — feature regression).
- Multi-tenancy / user accounts (no relevance for personal tool).
- Cross-Cortex communication / sync (next chapter, after embedded Postgres lands).
