# Embedded DB, QuickStart onboarding & the config/secrets contract

Design notes + implementation record from the "smooth install/setup/config/GUI-binding"
research, grounded in Sigil's actual code. Three deliverables:

1. **Embedded database** — kill Postgres/Docker as a prerequisite (built + verified).
2. **`sigil setup --quickstart`** — non-interactive, zero-config onboarding (built + verified).
3. **Config & secrets contract** — what to keep, the one gap to close, and the mutation rule.

The research these grew out of surveyed Hermes, OpenClaw, Open WebUI, PGlite,
embedded-postgres, pgserve, and Tauri. The single highest-leverage finding for a
Postgres-backed local tool: **an embeddable in-process database eliminates the
backend as an installation concern entirely.** Everything below follows from that.

---

## 1. Embedded database (PGlite) — built & verified

### Why PGlite, not embedded-postgres

The research surfaced two embedding routes. For Sigil they are **not** equivalent:

| | PGlite | embedded-postgres (zonky) |
|---|---|---|
| Engine | Postgres 17.5 → WASM, in-process | Real PG binaries, spawned child process |
| **pgvector** | **Bundled** (`/vector` extension, v0.8.1) | **Not included** — would need custom-compiled binaries |
| pg_trgm | Bundled (`/contrib/pg_trgm`) | Stock contrib only |
| Install friction | npm dep, no post-install | Post-install symlink script; **pnpm needs `approve-builds`** |
| Process model | Single in-process engine | Child process per instance |
| Footprint | ~16 MB installed (WASM+data) | ~30 MB+ per platform binary |

Sigil **requires pgvector** (1024-dim embeddings) and **pg_trgm** (entity-name
trigram index). embedded-postgres ships neither → it would mean maintaining a
custom Postgres build. PGlite ships both. **Decision: PGlite.**

### Empirical verification (not taken on faith)

Two throwaway scripts under `scripts/` prove it end-to-end in this repo:

- `scripts/pglite-pgvector-smoke.mjs` — PGlite runs **PostgreSQL 17.5 + pgvector
  0.8.1**, with `vector(1024)`, `halfvec(1024)`, an HNSW `halfvec_cosine_ops`
  index, and correct cosine-similarity ranking. ✅
- `scripts/embedded-migrate-smoke.mjs` — Sigil's **entire 36-migration suite**
  applies against the embedded engine: 23 tables, pgvector live. ✅

> The research's "PGlite is ~3 MB gzipped" claim was **refuted** during
> verification, and that holds here: real installed footprint is **~16 MB**
> (WASM blob + Postgres data files), ~6–7 MB gzipped. That's the price of a
> zero-prerequisite Postgres — acceptable, but measure, don't quote the myth.

### What was wired

| File | Change |
|---|---|
| `src/db/pglite-adapter.js` | Resolved a stale git merge conflict; routed the data dir through `SIGIL_DB_PATH` (`~/.sigil/db`); **registered `pg_trgm`** alongside `vector` (a migration needs it, else `CREATE EXTENSION` fails). |
| `src/db/drivers/index.js` | `selectDriver()` now returns `{ kind, provider, connection, client }`. New `embedded` branch returns the `ClientPGlite` dialect class + `{ pglitePath }`. |
| `src/db/cortex.js` | `client: driver.client || 'pg'`; pool capped at **1** for embedded (PGlite is single-connection). |
| `src/db/migrate.js` | New `migrateEmbedded()` — runs migrations through the PGlite dialect and deliberately **does not** `destroy()` (the engine is a process-wide singleton shared with the daemon pool). |
| `src/config.js` | New live `db.mode` getter (`SIGIL_DB_MODE` env escape hatch). |
| `src/setup/config-store.js` | `DB_MODES` gains `'embedded'`. |
| `src/setup/db/embedded.js` | New `provisionEmbedded()` setup service. |
| `src/setup/steps/database.js` | `validate`/`apply` route `embedded` → `provisionEmbedded`. |
| `build.js` | `@electric-sql/pglite` (+ `/vector`, `/contrib/pg_trgm`) marked **external** (WASM, dynamically imported). |
| `package.json` | Moved `@electric-sql/pglite` **devDependency → optionalDependency** (it must ship for embedded mode; optional keeps it off server-Postgres installs). |

### The one hard constraint: single-process

PGlite can be opened by **exactly one OS process at a time** (no multi-process
locking). Sigil's architecture already satisfies this — the **daemon is the sole
DB owner**; the CLI and hooks reach the DB through it over the Unix socket. But:

- Any **direct-DB CLI path** (`sigil migrate`, a future `sigil reset`) must run
  with the daemon **stopped**, or be routed through the daemon. `sigil setup
  --quickstart` enforces this with a `detectRunningDaemon()` guard.
- The daemon must rebuild its cortex pool after a mode switch (today: restart).
  A live-rebuild hook is the clean follow-up if mode-switching-without-restart
  matters.

### Open follow-ups

- ~~Make the GUI database step offer "Embedded (recommended, no setup)"~~ **Done.**
  `detect()` now reports `embedded:{available:true}` and the wizard renders a
  RECOMMENDED "Use the built-in database" card as the first option
  (`src/setup/db/detect.js`, `src/gui/web/setup.js`).
- **Daemon pool-rebuild (the one real integration gap — affects ALL modes).** The
  daemon's `cortexDb` is a frozen singleton bound at boot (`probeDbHealth` imports
  it before setup runs); `run-migrations.js` already notes a new DB "isn't picked
  up until restart." So after ANY in-GUI database step, the daemon serves memory
  from the new DB only after a restart — the wizard does `location.reload()` (page,
  not daemon). For embedded this also matters for the single-process lock: the
  daemon must be the sole PGlite owner. Fix options: (a) restart the daemon when a
  database step completes, or (b) make the default export a Proxy over a swappable
  knex + a `rebuildCortex()` called after `patchConfig('database', …)`. (b) is the
  clean, mode-agnostic fix. **Until this lands, the embedded GUI path provisions
  correctly but goes fully live on the next daemon start; the CLI quickstart works
  today because it's a single fresh process.**
- Consider PGlite as the default for *new* installs, with server Postgres as the
  opt-in "scale/share" path.

---

## 2. `sigil setup --quickstart` — built & verified

Implements the research's dominant first-run pattern: **a QuickStart path with
working defaults, plus an escape hatch to full control.**

```
sigil setup                 → prints the choice (QuickStart vs `sigil init` vs GUI)
sigil setup --quickstart    → non-interactive defaults, zero prompts
  [--name "Ada"]            → identity (default: $USER)
  [--embedding-key sk-...]  → OpenAI embeddings instead of local Ollama
```

QuickStart defaults: **embedded DB · keyless Claude Code LLM · local Ollama
embedder (auto-pulled) · name from `$USER`.**

Key design choices:

- **Reuses the headless step engine** (`src/setup/service.js` `runStep`/
  `detectStep`) that the GUI drives — so CLI and GUI **cannot diverge**. New code
  is just an orchestrator (`src/cli-handlers/quickstart.js`), registered as the
  `setup` command.
- **The embedder is the real friction, not the DB.** Embedded mode solves the
  database; embeddings still need Ollama *or* a key. QuickStart auto-detects
  Ollama, else accepts `--embedding-key`, else **stops with one crisp
  instruction** rather than failing obscurely.
- **The final identity step exercises the full pipeline** (classify → embed → DB
  write), so any misconfiguration surfaces honestly at setup time.
- **Single-process guard** up front: refuses to run if a daemon holds the engine.

Verified: a full isolated run went green end-to-end — embedded DB (36
migrations) → Claude Code → Ollama `mxbai-embed-large` (1024d) → first memory
written and classified. The same handler degrades gracefully to "DB ready,
embeddings pending" when no embedder is present.

---

## 3. Config & secrets contract

### Verdict: keep `config.json`. Do not convert to YAML.

The research recommended "config.yaml + .env split." For Sigil that's the wrong
move on format and **half-right on structure**. Sigil's `config.json` store
(`src/setup/config-store.js`) is already **better** than a YAML file would be:

- **Schema-versioned** with ordered migrations (defaults live in code, merged at
  read time — the exact mechanism that stops stale files breaking upgrades).
- **Sparse** (only explicitly-set keys persisted) + **validated on write**.
- **Atomic** (tmp + rename), `chmod 600`, in-memory cache refreshed per patch.
- **Env-override layered**: `shell env > project .env > ~/.sigil/.env > config.json > code defaults`.

Converting to YAML would throw all of that away for cosmetics. **Reject.**

### The one real gap: secrets are co-located with settings

Today, API keys and the DB password live **inside** `config.json` alongside
non-secret settings (`llm.apiKey`, `embedding.apiKey`, `database.password`).
The research's genuine insight — **separate the secret material** — still applies.

**Recommended split** (single per-user dir, two files, one writer):

```
~/.sigil/
  config.json     non-secret settings   chmod 600   safe to inspect/diff/attach to a bug report
  secrets.json    API keys + DB password chmod 600   never logged, never crosses the bus/RPC boundary
```

- `secrets.json` holds only `{ llm.apiKey, embedding.apiKey, database.password }`
  (and any future tokens). Same atomic-write + `chmod 600` discipline.
- `config.js` getters read secrets from `secrets.json`, everything else from
  `config.json` — the merge is invisible to callers.
- Why bother: `config.json` becomes **safe to share** (attach to an issue, sync
  across devices, diff in review) without leaking keys; the security boundary is
  explicit; and it matches the redaction the bus already does
  (`service.js redactSecrets`) at rest instead of only in flight.

This is **additive** — `patchConfig('database', { password })` would just route
the `password` key to `secrets.json`. No caller changes, no format change.

### The mutation contract (already correct — keep it)

The research's "GUI routes mutations through the CLI, never writes files
directly" is **already true in Sigil**, via a cleaner mechanism than subprocess
shelling:

```
GUI (app.js)
  └─ POST /api/v1/rpc            (fetch, same-origin, token-auth cookie)
       └─ daemon handler
            └─ patchConfig(section, values)   ← the SINGLE sanctioned writer
                 └─ atomic write + cache refresh
```

`patchConfig()` in `config-store.js` is the **only** function that writes config.
The GUI never touches the filesystem; the CLI hits the same daemon over the Unix
socket. CLI and GUI therefore can't drift. **Rule to preserve as the codebase
grows: nothing writes `~/.sigil/config.json` (or the new `secrets.json`) except
`patchConfig()`/`setStepStatus()`.** Any new mutation path goes through a step or
an RPC handler that calls `patchConfig`, never `writeFileSync`.

### Summary table

| Research recommendation | Sigil status | Action |
|---|---|---|
| Config in a single per-user dir | ✅ `~/.sigil/` | none |
| CLI/daemon as canonical write path | ✅ `patchConfig()` only | preserve the invariant |
| GUI routes mutations through it | ✅ RPC → `patchConfig` | none |
| **Secrets separate from settings** | ❌ co-located in `config.json` | **split out `secrets.json`** |
| YAML format | n/a | **reject** — JSON store is strictly better |
| chmod 600 / atomic writes | ✅ | apply same to `secrets.json` |
```
