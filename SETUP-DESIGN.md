# Sigil Setup & Distribution Design

> Goal: a hassle-free install → init → update flow across all entry points (CLI, MCP, GUI, hooks, future TUI), with every known breaking point designed out.
>
> Sources: codebase audit (2026-06-04) + deep-research over 30 primary/secondary sources (mem0, Letta, Graphiti, cognee, Smithery, add-mcp, Anthropic DXT/.mcpb, PGlite, sqlite-vec, LanceDB, update-notifier, XDG, keychain). Claims marked **[V]** were adversarially verified; **[K]** = my domain recommendation filling a research gap (research returned no verified claim).

---

## 0. The core problem, restated

Sigil has **five entry points that each assume setup already happened**:

| Entry point | How it's reached | What it assumes is true |
|---|---|---|
| CLI (`sigil <cmd>`) | `npx` / global bin | daemon running, DB reachable, config valid |
| MCP server (stdio) | harness spawns `node dist/server.js --mcp` | daemon socket exists, baked path still valid |
| Browser GUI | `npx sigil` → opens `127.0.0.1:7777` | a browser exists to open |
| Hooks (4×) | Claude reads `~/.claude/settings.json` | baked `node /abs/path/...` resolves, provider valid |
| Future TUI | — | — |

Every breaking point is a **violated assumption** at one of these surfaces. The fix is not "more wizard" — it's **collapsing the number of things that must be true**, and making each surface **self-diagnose and self-heal** when an assumption breaks.

---

## 1. What the ecosystem actually converged on (2025–2026)

The research confirms three install tiers have become standard for agent-facing tools:

1. **Hosted/remote MCP** — zero local infra, connect by URL + key. *(But: no major memory product is truly zero-local — even mem0's cloud MCP installs an `npx` registration tool locally. **[V]** the "fully zero-install" claim was refuted 1-2.)*
2. **Packaged local server** — one command writes every client's config for you. The winning shape is a **multi-client registration command**: `npx mcp-add ... --clients "claude,cursor,windsurf,vscode,opencode"` (mem0), `smithery mcp add <url> --client <name>`, `npx add-mcp` (Neon). **[V]**
3. **Desktop bundle (`.mcpb`)** — ZIP + `manifest.json`, double-click install; Claude Desktop ships its own Node so the user needs nothing. **[V]** *(But: `.mcpb` is Claude-Desktop-only today — cross-client compat refuted 0-3. Not a substitute for the npx path.)*

**Patterns worth stealing directly:**

- **Multi-client one-shot registration** with a `--clients` flag, writing each harness's native config — mem0, Smithery, add-mcp all do this. **[V]** Sigil already auto-detects clients in `init`; formalize it as a standalone re-runnable command.
- **Non-interactive `--agent` init** — mem0 ships `mem0 init --agent --agent-caller <name>` that mints a key with *no email, no dashboard, no OTP*, designed to be run **by an agent inside a harness**. **[V, medium]** This is the "paste-this-prompt-to-your-agent" pattern done right.
- **Skills as a distributable** — `npx skills add <repo> --skill <name>` installs the harness integration without the user hand-editing `settings.json`/`CLAUDE.md` (mem0 ships skills for Claude Code, Codex, Cursor, Windsurf, OpenCode, OpenClaw). **[V]**
- **Inline config to skip prompts** — `smithery mcp add ... --config '{...}'` for CI/headless. **[V]** → directly motivates `sigil init --config file.json`.
- **Project vs global scope** — add-mcp defaults to project scope, `-g` for global. **[V]** Sigil should let users choose: personal (global hooks) vs team-shared (project `.mcp.json`).
- **URL-based MCP registration** — cognee registers via `claude mcp add cognee-sse -t sse http://localhost:8000/sse`, *not* a binary path. **[V]** **This is the single most important finding for Sigil** (see §4).

**The anti-pattern to avoid:** Graphiti requires `git clone + uv sync`, no registry, no zero-infra path. **[V]** That's the high-friction baseline Sigil must beat.

---

## 2. Target setup flow (the "north star")

The ideal first-run, ranked by how few things must be true:

```
$ npx @anmol-srv/sigil
```
…should Just Work to a usable memory in **one command, zero questions, zero infra**, then progressively offer power. Concretely:

### Tier 0 — Zero-config default (NEW, the big unlock)
- `npx @anmol-srv/sigil` with no prior setup → starts daemon on an **embedded local store** (no Postgres prompt), picks **`claude-cli` provider** (already the default — uses the Claude subscription, no API key), uses a **local embedder** by default, runs migrations against the embedded DB, smoke-tests, registers hooks into detected clients, prints the GUI URL.
- The user answers **nothing**. Memory works in the next agent turn.
- Postgres becomes a **`sigil db upgrade postgres`** opt-in for users who want sync/scale — not a precondition. (See §5.)

### Tier 1 — Interactive `sigil init` (today's wizard, slimmed)
- Only reached when the user *wants* to change provider/embedder/DB. Keep `@clack/prompts`. Every prompt has a working default so you can `[enter]` through it.
- Add `--yes` (accept all defaults, non-interactive) and `--config <file>` (inline config, skip prompts) — the Smithery pattern. **[V]**

### Tier 2 — Agent-installable `sigil init --agent` (NEW)
- Fully non-interactive, machine-readable output (JSON), no TTY needed. Designed to be run **by an agent** from a paste-able prompt (see §7). Mirrors mem0's `--agent` mode. **[V, medium]**

### Tier 3 — Client registration as a first-class, re-runnable command
- Promote the client-install step out of `init` into `sigil connect [--clients claude,cursor,codex,kiro] [--scope global|project]`. Idempotent, re-runnable after any reinstall to **re-sync paths** (this is the portability self-heal). Mirrors mem0/add-mcp. **[V]**

---

## 3. Breaking point → fix matrix

| # | Breaking point (today) | Root cause | Fix | Priority |
|---|---|---|---|---|
| 1 | **Postgres+pgvector required** | hard precondition in `init` | Ship embedded default (§5); make Postgres a `db upgrade` path | **P0** |
| 2 | **Baked absolute binary path** in `~/.sigil/CLAUDE.md` + hook commands | `which sigil` frozen at init time | Stop baking paths — use a stable shim + URL-based MCP (§4) | **P0** |
| 3 | **Provider/model/dim mismatch fails silently** | no consistency guard | Provider-lock file + startup guard + `doctor` auto-fix (§6) | **P0** |
| 4 | **Socket/hook timeouts** (30s socket vs 120s claude-cli; 10s read hook) | serial LLM calls on cold start | Fast-path read hook, persistent LLM cache, raise/spool writes (§8) | P1 |
| 5 | **No self-update** | nothing checks versions | `update-notifier` + daemon version-drift restart (already partial) + `sigil upgrade` (§9) | P1 |
| 6 | **Headless can't open GUI** | assumes a browser | Detect TTY/DISPLAY/SSH → print URL + device-style fallback (§10) | P1 |
| 7 | **Re-running init / upgrade clobbers user edits** in generated files | full-file rewrite | Marker-delimited managed blocks + version marker (already partial) (§9) | P2 |

---

## 4. Kill the baked path (P0) — the highest-leverage fix

**Today:** `init` runs `which sigil` and freezes e.g. `/Users/anmol/Drive/Projects/sigil/dist/cli.js` into `~/.sigil/CLAUDE.md` and into each hook command in `settings.json`. Any of these break it: nvm node version switch, global-prefix change, `npx` cache rotation, moving the repo, reinstall. The regenerated context block in this very session still shows that exact absolute path. **[V]** This whole class of bug is what the ecosystem moved *away* from.

**Two-layer fix:**

**(a) For the MCP server — register by URL, not by binary path. [V]**
Sigil already runs a long-lived daemon with an HTTP server on `127.0.0.1:7777`. Add a streamable-HTTP (or SSE) MCP transport on the daemon and register harnesses against the URL:
```
claude mcp add sigil --transport http http://127.0.0.1:7777/mcp
```
This is exactly cognee's pattern **[V]**. The harness config now contains **no node path, no dist path** — immune to node-version/reinstall drift. The stdio binary stays as a fallback for harnesses that don't support HTTP transport, but HTTP becomes the default for Claude Code / Cursor.

**(b) For hooks and the CLI path in `CLAUDE.md` — use a stable shim, not a frozen path. [K]**
Hooks must exec *something*. Don't freeze the resolved path; instead:
- Install a **stable launcher** at a fixed, version-manager-independent location: `~/.sigil/bin/sigil` (a tiny shell shim that execs the current node + the installed cli.js, resolving the real location at runtime). Reference `~/.sigil/bin/sigil` everywhere — it never moves even when node does.
- Generated `CLAUDE.md` references `~/.sigil/bin/sigil remember ...` instead of the frozen `dist/cli.js` path.
- The shim self-heals: on each run it verifies the target still resolves; if not, it re-resolves (or prints a one-line `sigil connect` hint).
- Alternative considered: `npx -y @anmol-srv/sigil` in hooks. **Rejected** for hooks — npx cold-start (300ms–2s) blows the 10s read-hook budget and adds network flakiness. The shim is faster and offline-safe. Keep `npx` only for the *first* bootstrap.

**Net:** after this, a node version switch or reinstall **cannot** break an existing install. `sigil connect` re-points everything if it ever does.

---

## 5. Storage: make Postgres optional (P0)

**The friction:** forcing every user to provision Postgres+pgvector (local bootstrap with admin creds, or a connection URL) before memory works at all. This is your #1 drop-off. The ecosystem norm for local-first AI tools is **embedded-by-default, hosted-as-upgrade**.

**Options surveyed:**

| Option | Pros | Cons / risk | Verdict |
|---|---|---|---|
| **PGlite + pgvector** (WASM Postgres) | Same SQL/Knex/pgvector code path as your existing Postgres — minimal code fork | "<3MB / drop-in" claims **disputed [K, refuted 1-2]**; WASM perf + write-concurrency limits; single-process | **Recommended default** — you already deprecated PGlite once; revisit because it preserves your entire query layer |
| **sqlite-vec** | Tiny, ubiquitous, fast for <1M vectors | Different SQL dialect → second DB driver + migration set to maintain | Strong alt if PGlite perf disappoints |
| **LanceDB** | Embedded, columnar, great vector perf, no server | Not relational — your facts/pods/edges graph schema would need rework | Overkill for your relational model |
| **Keep Postgres required** | Already works; best for sync/multi-device | The friction you're trying to kill | Demote to opt-in |

**Recommendation [K]:** ship **PGlite+pgvector as the zero-config Tier-0 default** because it keeps your Knex migrations, `vector(1024)` columns, and query layer essentially unchanged — the data lives at `~/.sigil/pgdata`. Promote to real Postgres only when the user opts into sync/scale:
```
sigil db upgrade postgres --url postgres://...    # migrates embedded → server, copies data
```
Because the schema and dimension are identical, the upgrade is a `pg_dump`-style copy, not a re-embed. This directly serves your stored sync strategy (shared external DB as v1 multi-device sync) — embedded for solo, Postgres when you sync. Gate the choice behind `SIGIL_MODE`: `solo` → embedded, `master/follower` → Postgres.

> Honest caveat: PGlite's marketing size/perf claims didn't survive verification **[refuted 1-2]**. Validate with a real benchmark of your write path (AUDM does 3–14 serial LLM calls per ingest; the DB is rarely the bottleneck, which *favors* embedded). If PGlite write-concurrency bites, fall back to sqlite-vec.

---

## 6. Config & the dimension footgun (P0)

**The footgun class:** `EMBEDDING_PROVIDER=ollama` + `EMBEDDING_MODEL=text-embedding-3-large`, or switching providers at a different native dim than the locked 1024 → silent NULL/garbage vectors. You've already fixed several instances (force-reset model on provider change; `embedBatchOrThrow`). Make it **structurally impossible**:

**Provider-lock file [K]** (research returned no verified prior art here — this is the standard "lockfile guards a derived invariant" pattern):
- On first successful embed, write `~/.sigil/embedding.lock` = `{provider, model, dim, sha}`.
- Every daemon boot + every hook entry: assert live config matches the lock. Mismatch → **fail closed with a specific remedy** (you already have `failClosedOnBadConfig`; point it at the lock): *"Embedding config changed (ollama/mxbai-embed-large@1024 → openai/...@3072). Existing vectors are 1024-dim. Run `sigil db reset --reembed` to rebuild, or `sigil config embedding --restore` to revert."*
- Never let a dimension change reach the DB column silently — you have a pgvector insert-time assertion; surface it as a *config* error, not a runtime crash.

**Config location [K]:** you're at `~/.sigil/config.json`. That's the dominant convention for agent CLIs (mem0 `~/.mem0`, Claude `~/.claude`) — keep it. Optionally honor `$XDG_CONFIG_HOME` and `$SIGIL_CONFIG_DIR` for Linux/CI users, falling back to `~/.sigil`. Keep `chmod 600` + atomic write.

**Secrets [K]:** API keys in `config.json` (600) is acceptable and matches the field. Offer **OS keychain** (`keytar`/`cross-keychain`) as an opt-in for users who want it; never *require* it (keychain is painful in headless/CI — the very environments you also need to support). Keep the `secret-mask` redaction in logs/hooks.

**Schema versioning:** you already have `config-store.js` migrations keyed by version — keep that, and add the embedding-lock check to the same boot path.

---

## 7. The agent-installable "paste this prompt" pattern (NEW capability)

This is what the user explicitly asked about, and the research shows it's now a real, expected affordance. Two complementary deliverables:

**(a) A canonical install prompt** users paste into any coding agent:
```
Install Sigil (persistent agent memory) for this machine. Run:
  npx -y @anmol-srv/sigil init --agent
Then confirm `sigil status` reports a healthy daemon and that
hooks were registered into my detected agent clients. If the GUI
URL is printed, share it. If anything fails, run `sigil doctor`
and fix what it reports.
```
For this to be reliable, `init --agent` must be **non-interactive, idempotent, JSON-emitting, and never block on a TTY** — exactly mem0's `--agent` design. **[V, medium]**

**(b) An `AGENTS.md` / `llms.txt` install recipe** in the repo root and published, so agents that read those files can self-serve. Ship harness **skills** the mem0 way — `npx skills add github.com/anmol-srv/sigil --skill claude-code` — so the integration installs without hand-editing `settings.json`. **[V]**

**Why it's reliable when done right:** no interactive prompts to hang on, machine-readable success/failure, idempotent so a retry is safe, and a `doctor` fallback the agent can act on autonomously.

---

## 8. Timeouts & the hook hot path (P1)

From `CLAUDE-INTEGRATION-ANALYSIS.md`: 30s socket vs 120s claude-cli; 10s read-hook budget vs two cold `claude -p` calls (10–30s). Fixes:

- **Read hook (`UserPromptSubmit`) must never exceed its budget.** Run search on a **fast path** (vector+keyword only, no LLM query-expansion) within budget; do LLM query-routing/expansion **asynchronously** and cache for the *next* turn. Better a fast 90%-good injection than a timeout. *(You already have a `route:true` path — make the LLM portion optional under a deadline.)*
- **Persistent LLM response cache.** Embeddings are Postgres-cached; LLM responses are in-memory only (lost on daemon restart). Add a small persistent cache (same `embedding_cache` table pattern, keyed by provider+model+prompt-hash) for classifier/router/expander calls. Biggest single win for cold-start latency.
- **Write path:** keep `--bg` + spool (you have `.stop-spool.jsonl`), but make `--bg` truly detach from the 30s socket deadline, and surface spooled-but-unsaved counts in `doctor` so failures aren't silent.

---

## 9. Update / versioning (P1)

- **`update-notifier`** on CLI invocation (the npm-standard, low-noise once-a-day check) → prints "vX→vY available, run `sigil upgrade`". **[V — package is the standard]**
- **`sigil upgrade`**: `npm i -g` (or refresh npx) → restart daemon → re-run `sigil connect` to re-sync generated files. One command.
- **Daemon version drift:** you already auto-restart the daemon on CLI/daemon version mismatch (cli.js ~L97). Keep it; add a health line in `doctor`.
- **Re-syncing generated files without clobbering edits:** you already use an `INSTRUCTIONS_VERSION` marker + marker-delimited blocks (`<!-- sigil-context -->`). Extend the same managed-block discipline to *every* file you write into a user's config (the `@import` line, hook entries, Cursor/Codex/Kiro blocks): only ever rewrite content **between your markers**, never the whole file. On upgrade, re-emit managed blocks; leave everything outside untouched.

---

## 10. Headless / SSH / CI degradation (P1)

`npx sigil` assumes it can open a browser. Detect the environment and degrade:
- No TTY, or `$SSH_CONNECTION`/`$CI`/no `$DISPLAY` (Linux) → **don't try to open a browser**; print the GUI URL + token and the `sigil init` CLI path instead. Add an explicit `--no-browser` flag.
- For remote setups where even `127.0.0.1:7777` isn't reachable from the user's machine, document an SSH port-forward one-liner, or fall back to **fully-CLI `init`** (no GUI needed — the wizard already works in the terminal).
- This is the same class of fix as the Neutron "no display" failure already in your memory. Make "no browser available" a first-class, non-fatal branch, not an exception.

---

## 11. Recommended command surface (consolidated)

```
npx @anmol-srv/sigil                 # Tier 0: zero-config, embedded, just works
sigil init                           # Tier 1: interactive (slimmed; every prompt has a default)
sigil init --yes | --config f.json   # non-interactive / inline config (CI)
sigil init --agent                   # Tier 2: agent-driven, JSON out, no TTY
sigil connect [--clients ...] [--scope global|project]   # (re)register harnesses; self-heal paths
sigil doctor [--deep] [--fix]        # diagnose + auto-fix; the agent's fallback
sigil db upgrade postgres --url ...  # opt-in embedded → Postgres migration
sigil upgrade                        # update pkg + daemon + re-sync generated files
sigil status                         # health: daemon, DB, provider, embedding-lock, spool
```

---

## 12. Sequenced plan

**P0 (kills the top drop-offs):**
1. Embedded storage default (PGlite+pgvector), Postgres demoted to `db upgrade`. (§5) — *open: storage benchmark first*
2. Stable `~/.sigil/bin/sigil` shim → no baked paths. (§4) — **✅ DONE**. Hooks + CLAUDE.md re-routed through `~/.sigil/bin/sigil` + `sigil-hook` (instructions v4). MCP clients (Cursor/Codex/Kiro) + `register` now use the `~/.sigil/bin/sigil-mcp` stdio shim — no baked `node /abs/server.js`. **Plus** the daemon now serves MCP over HTTP at `POST /mcp` (Streamable HTTP, bearer-auth, in-process registry dispatch), enabling URL-based registration (`sigil register --http` → `claude mcp add --transport http http://127.0.0.1:7777/mcp`). The URL never moves, so it's immune to path drift entirely.
3. Embedding-lock file + fail-closed remedy messaging. (§6)
4. Tier-0 zero-config first run (`npx sigil` answers nothing, works). (§2)

**P1:**
5. `sigil connect` as standalone re-runnable command — **✅ DONE** (`runConnect` in `src/cli.js`; re-pins shims + re-syncs clients, agent/CI-safe, `--clients`/`--all`/`--dry-run`). Managed-block discipline for all generated files still pending. (§3,§9)
6. Read-hook fast path + persistent LLM cache. (§8)
7. Headless detection + `--no-browser`. (§10)
8. `update-notifier` + `sigil upgrade`. (§9)

**P2:**
9. `sigil init --agent` + paste-prompt + `AGENTS.md`/`llms.txt` + harness skills. (§7)
10. `.mcpb` bundle artifact for Claude Desktop users (alongside npx). (§1)
11. Optional keychain secret storage. (§6)

---

## 13. Research gaps / open questions (be honest)

- **Embedded DB choice is unvalidated** — PGlite size/perf claims were *refuted* in research. Benchmark your actual write path before committing; sqlite-vec is the fallback.
- **No verified prior art** surfaced for config-dimension-consistency patterns or CLI/daemon version-drift beyond `update-notifier` — §6/§9 are domain recommendations **[K]**, not citations.
- **Competitors not covered:** txtai, Memary, Memobase, Supermemory, "ogham" returned no verified data (too niche / no MCP story). If any is a real comparator, do a targeted teardown.
- **`.mcpb` is Claude-Desktop-only today** — don't treat it as a universal install path; cross-client compat was refuted 0-3.
