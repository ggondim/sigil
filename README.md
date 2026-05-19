<div align="center">

# Sigil

### Persistent memory for AI coding agents.

Postgres-backed knowledge engine. Atomic facts, entity graph, hybrid retrieval.<br/>
**Auto-integrated with Claude Code** via hooks. **Works with any MCP client** — Cursor, Continue, Cline, Windsurf, anything that speaks the protocol.

```bash
# 1. Have Postgres + pgvector running. Quickest path with Docker:
docker run -d --name sigil-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=sigil_dev pgvector/pgvector:pg15

# 2. Install Sigil and let it bootstrap the database.
npm install -g @anmolsrv/sigil
sigil init        # Claude Code: full auto-integration
sigil register    # any other agent: get the MCP server config
```

[![npm](https://img.shields.io/npm/v/@anmolsrv%2Fsigil)](https://www.npmjs.com/package/@anmolsrv/sigil)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-native-8B5CF6)](https://modelcontextprotocol.io/)
[![Benchmark](https://img.shields.io/badge/LongMemEval%20oracle%20n%3D100-R@10%20100%25-6B1A2A)](./eval/longmemeval/RESULTS.md)
[![License](https://img.shields.io/badge/license-ISC-blue)](https://opensource.org/licenses/ISC)

[**Quickstart**](#quickstart) · [How it works](#how-it-works) · [Other agents](#use-with-other-agents) · [Benchmarks](#benchmarks) · [Commands](#commands) · [FAQ](#faq)

</div>

---

## The 30-second demo (Claude Code)

```bash
# Tell Sigil something once
sigil remember "We use canary deploys: 5% for 30min, then 25%, then full cutover. Rollback via LaunchDarkly killswitch."

# Open a brand-new Claude Code session in any project. Ask it:
#   "What's our deployment strategy?"

# Claude answers immediately — Sigil auto-injected the fact via the
# UserPromptSubmit hook before Claude ever saw your prompt.
```

That's the whole pitch. **One command to remember. Zero commands to recall.** The hook handles it.

For Cursor / Continue / Cline / etc., the CLI half is the same — only the recall mechanism changes. Your agent calls the `search` MCP tool when it needs context. See [Use with other agents](#use-with-other-agents) below.

---

## What you actually get

- **Persistent memory** across every session, every project, every day — regardless of which agent you're using
- **Hybrid retrieval** — vector + keyword fused via Reciprocal Rank Fusion, with optional read-time synthesis. **R@10 = 100%** on LongMemEval oracle split (n=100, ~25 chunks per haystack — full caveats in [RESULTS.md](./eval/longmemeval/RESULTS.md))
- **Local-first** — your data lives in your own Postgres. No cloud. No telemetry. No vendor lock-in. Run it on your laptop, your home server, RDS — your call.
- **Postgres + pgvector required** — `sigil init` bootstraps the database, user, and `vector` extension on first run. You bring a running Postgres (Docker, brew, RDS, anything); Sigil handles the rest.
- **Bring-your-own LLM** — OpenAI, Anthropic, OpenRouter, or Ollama. Embeddings: OpenAI, Voyage, or local Ollama. No API key required if you point at Ollama.
- **MCP-native** — 9-tool MCP server works with Claude Code, Cursor, Continue, Cline, Windsurf, ChatGPT desktop, or any other tool that speaks the [Model Context Protocol](https://modelcontextprotocol.io/)
- **Deep Claude Code integration** — four hooks on top of MCP: `UserPromptSubmit` injects relevant memory before every prompt, `PostToolUse` captures observations from Edit/Write/Bash, `Stop` auto-extracts memorable user statements, `SessionEnd` synthesizes a durable session summary. No `! sigil remember` calls needed.
- **Three-layer knowledge model** — chunks (raw text), facts (atomic statements with confidence/importance/temporal validity), entity graph (typed nodes + relations). Not a flat vector store.

---

## Why it exists

Every time you open an AI coding agent — Claude Code, Cursor, Continue, anything — it starts from zero. You re-explain the same architecture. You watch the agent repeat mistakes you corrected last week. You lose hours to context-loading that should be instant.

Sigil is a thin local layer that fixes this. The memory is *just there*, in every session, on every project, on every machine you install it on. With Claude Code it runs invisibly via hooks. With other MCP clients it shows up as a tool the agent can call. The data lives in your own Postgres — no cloud, no subscription, no telemetry.

---

## Quickstart

Sigil needs **Postgres 13+ with the `pgvector` extension** available. You bring the server; `sigil init` does the rest.

### Step 1 — Have Postgres running

Pick whichever path fits your setup:

```bash
# Docker (recommended, includes pgvector out of the box)
docker run -d --name sigil-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=sigil_dev pgvector/pgvector:pg15

# Homebrew on macOS
brew install postgresql@15 pgvector
brew services start postgresql@15

# Existing managed Postgres (RDS, Neon, Supabase, ...)
# Just enable the `vector` extension in the parameter group / SQL console.
```

### Step 2 — Install Sigil

```bash
npm install -g @anmolsrv/sigil
sigil init
```

`sigil init` runs an interactive wizard that:

1. Asks for your LLM provider (OpenRouter, OpenAI, Anthropic, Ollama, or Claude Code subscription).
2. Asks for embedding provider (OpenAI, Voyage, or local Ollama).
3. Asks for your Postgres connection — defaults to `localhost:5432/sigil` with user `sigil_app`. **If the database doesn't exist yet, Sigil asks once for your Postgres admin credentials and creates the DB, user, and `pgvector` extension automatically.** Admin creds are used once and discarded; only the least-privilege `sigil_app` credentials land in `~/.sigil/.env`.
4. Runs the schema migrations.
5. Registers four hooks in `~/.claude/settings.json` (UserPromptSubmit, PostToolUse, Stop, SessionEnd) so Claude reads, writes, and updates memory automatically.
6. Adds `@~/.sigil/CLAUDE.md` to your global Claude config so a top-20 hot-facts snapshot is always in context.

That's it. Open Claude Code and start a new session — your memory is already wired in.

```bash
sigil doctor   # verify everything works
```

```
Sigil diagnostic

  ✓ Config file — ~/.sigil/.env
  ✓ Config validation — no provider/model mismatches
  ✓ Database — Postgres @ localhost:5432/sigil
  ✓ Stored data — 53 docs, 47 chunks, 249 facts
  ✓ LLM provider — openrouter (model=google/gemini-flash-latest)
  ✓ Embedding provider — openai / text-embedding-3-large
  ✓ UserPromptSubmit hook — registered
  ✓ PostToolUse hook — registered
  ✓ Stop hook — registered (auto-saves memorable user statements)
  ✓ Sigil CLAUDE.md — ~/.sigil/CLAUDE.md
  ✓ Hook errors — none in ~/.sigil/.hook-errors.log

All checks passed.
```

### Cursor / Continue / Cline / any other MCP client

```bash
sigil init           # set up the DB + LLM provider (skip the Claude integration step when prompted)
sigil register --print
```

`sigil register --print` outputs the standard MCP server config JSON. Drop it into your client's MCP config — see the [Use with other agents](#use-with-other-agents) section for per-client paths and exact snippets.

### CLI only / programmatic / other

The CLI works in any terminal regardless of agent — `sigil remember`, `sigil search`, `sigil ingest`. There's also a REST API (`node $(npm root -g)/@anmolsrv/sigil/dist/server.js`) for programmatic integration.

---

## How it works

Sigil is three layers of knowledge, not a flat vector store:

| Layer | What's stored | Good for |
|-------|--------------|----------|
| **Chunks** | 512-token text blocks with contextual prefixes and embeddings | "Show me the relevant section" |
| **Facts** | LLM-extracted atomic statements — categorized, deduplicated, temporally tracked | "What do we know about X?" |
| **Entity graph** | Typed nodes (people, topics, documents) with relationships | "What's related to this?" |

### The ingestion pipeline

Every document goes through 6 stages:

```
Content → Classify → Dedup Check → Parse → Chunk + Embed → Extract Facts (AUDM) → Link Entities
```

- **Classify** — LLM decides: `thought` (fast-path) / `knowledge` (full pipeline) / `noise` (skip)
- **Dedup check** — SHA-256 hash skips unchanged content
- **Parse** — Format-aware parsers: markdown, text, html, code, json
- **Chunk + embed** — 512-token chunks with contextual prefixes, vectorized via Ollama or OpenAI
- **Extract facts (AUDM)** — LLM extracts atomic facts. For each fact, the **AUDM pipeline** (Add/Update/Delete/Merge) checks similarity against existing facts and decides: skip the duplicate, update the old version, contradict the stale one, or add as new.
- **Link entities** — 3-stage entity resolution (exact → embedding + LLM verify → create) builds a knowledge graph

### The search pipeline

```
Query → Cognitive Router → (Vector + Keyword) → RRF Merge → Graph Enhancement → Results
```

- **Cognitive router** — Classifies query intent (preference / factual / entity_lookup / exploratory / temporal)
- **Hybrid search** — Vector (semantic) + keyword (exact match) merged via Reciprocal Rank Fusion
- **Graph enhancement** — For exploratory queries, traverses entity graph to surface related facts

Results in ~30ms on a knowledge base of thousands of facts.

---

## Claude Code integration

Sigil's Claude Code integration is the deepest of any agent because Claude Code exposes hooks. With other agents you get the MCP tools (good) but not the auto-injection (better). Three complementary layers:

### 1. Hooks (automatic, invisible)

`sigil init` registers three hooks in `~/.claude/settings.json`:

- **`UserPromptSubmit`** — On every user prompt, searches Sigil for relevant facts and injects them as `additionalContext`. Claude sees the memory automatically.
- **`PostToolUse`** — On every Edit/Write/Bash, captures a lightweight observation in the background.
- **`Stop`** — After every assistant turn, an LLM classifier scans the latest user message for preferences, decisions, constraints, and corrections, then calls `sigil remember` for anything memorable. Reliable saving without depending on Claude to remember to call it.

No `! sigil search` or `! sigil remember` commands needed. Memory is invisible.

### 2. Hot context (passive)

`sigil init` writes a top-20 hot-facts snapshot to `~/.sigil/CLAUDE.md`, auto-imported into every Claude session via `@~/.sigil/CLAUDE.md` in `~/.claude/CLAUDE.md`. Facts are ranked by importance × access count × recency.

Refreshed automatically after every `sigil remember` and `sigil ingest`. Manual refresh:

```bash
sigil context
```

### 3. MCP tools (on-demand, also available to other clients)

Sigil exposes a 7-tool MCP server for deep knowledge access. Claude Code can call these directly; so can Cursor, Continue, and any other MCP client.

| Tool | Purpose |
|------|---------|
| `search` | Hybrid search across all facts and chunks |
| `search_entity` | Find entities by name or type |
| `traverse_graph` | Navigate entity relationships (neighbors / path / related) |
| `get_fact_context` | Full detail on a fact (provenance, source document, entities) |
| `get_entity_context` | Full detail on an entity (relations, facts, mentions) |
| `status` | Knowledge base statistics |
| `ingest` | Ingest content via the agent |

For Claude Code, `sigil register` wires it up via `claude mcp add`. For other clients see [Use with other agents](#use-with-other-agents) below.

---

## Use with other agents

Anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io/) can use Sigil. The MCP server is the same regardless of host; only the registration path differs.

`sigil register --print` outputs the standard config snippet:

```json
{
  "mcpServers": {
    "sigil": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/global/node_modules/@anmolsrv/sigil/dist/server.js", "--mcp"],
      "env": { "DOTENV_CONFIG_PATH": "/Users/you/.sigil/.env" }
    }
  }
}
```

Drop the inner `sigil: {...}` object into your client's `mcpServers` config:

| Client | Config file |
|--------|-------------|
| **Cursor** | `~/.cursor/mcp.json` (or Settings → MCP) |
| **Continue.dev** | `~/.continue/config.json` under `experimental.modelContextProtocolServers` |
| **Cline** (VS Code) | `cline_mcp_settings.json` in your VS Code user dir |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **ChatGPT desktop** | Settings → Integrations → MCP servers |
| **Anything else** | Any MCP-spec client; use `sigil register --print` to get the JSON |

Once registered, your agent gets the 7 tools above. Behaviorally:

- **The agent must choose to call them.** Unlike Claude Code's hooks, there's no auto-injection layer — your agent sees the tools and decides when to use them. Most agents do this well if their system prompt mentions the available tools; some need explicit nudging.
- **Capture relies on the agent.** Without Claude Code's `Stop` hook, you'll need to either tell your agent to call `ingest`/`remember` when something noteworthy comes up, or run `sigil remember` from the CLI yourself.
- **Hot-context is Claude Code only.** Other clients don't have a `@import`-style mechanism for always-loaded context. The MCP `search` tool gives equivalent on-demand capability.

If your agent supports custom system prompts or per-session instructions, paste this in to encourage proactive memory use:

> You have access to a persistent memory system called Sigil. Before answering questions about the user's projects, preferences, or past decisions, call `sigil_search` with a relevant query. When the user shares preferences ("I prefer X"), decisions ("we use X"), or constraints ("we can't use X because…"), call `sigil_ingest` to save them.

### CLI-only mode

You don't need an MCP client at all. The CLI is fully functional standalone:

```bash
sigil remember "Project uses Postgres 15 with pgbouncer"
sigil search "database conventions"
sigil ingest ./docs/architecture.md
sigil ingest "https://example.com/postmortem"
```

This is the right mode for: scripts, CI pipelines, agent fleets that don't speak MCP, or just keeping a personal knowledge base.

### REST API

For programmatic access from your own code:

```bash
node $(npm root -g)/@anmolsrv/sigil/dist/server.js
# Listens on PORT (default 4000)
# POST /api/ingest, GET /api/search, GET /api/entities, etc.
```

Auth via `sigil keys create --name=myapp`. Full route list: `src/api/routes/`.

---

## Commands

| Command | Description |
|---------|-------------|
| `sigil init` | Interactive setup — provider, DB, hooks, Claude integration |
| `sigil doctor` | Diagnose setup (DB, LLM, embeddings, hooks) |
| `sigil remember "text"` | Save one or more facts to memory (use `--bg` for background) |
| `sigil ingest <file\|url\|glob>` | Ingest documents into the knowledge base |
| `sigil search "query"` | Search the knowledge base |
| `sigil facts [--limit=N]` | List stored facts with IDs |
| `sigil forget <id>` | Delete a fact by ID |
| `sigil namespace list` | List all namespaces with fact counts |
| `sigil namespace delete <ns> --confirm` | Delete a namespace and all its data |
| `sigil export [--format=json\|markdown]` | Export knowledge base (backup/portability) |
| `sigil context` | Refresh hot-context snapshot |
| `sigil status` | Knowledge base statistics |
| `sigil migrate` | Run database migrations |
| `sigil reset --confirm` | Reset the database (drops all data) |
| `sigil register [--print]` | Register the MCP server (auto for Claude Code; `--print` outputs JSON for any other client) |

---

## Providers

Sigil supports four LLM providers with automatic detection:

| Provider | API key needed | Cost | Notes |
|----------|---------------|------|-------|
| **Claude Code** (`claude-cli`) | **No** — uses your existing subscription | Free with subscription | Default. Piggybacks on Claude Code auth |
| **OpenAI** | `OPENAI_API_KEY` | ~$0.15 / 1M input tokens (gpt-4o-mini) | Cheapest API option |
| **Anthropic** | `ANTHROPIC_API_KEY` | ~$0.80 / 1M input tokens (Haiku) | Direct Anthropic access |
| **Ollama** | None | Free (local) | Fully offline, uses your machine |

Embeddings:

| Provider | API key | Model | Dimensions | Notes |
|----------|---------|-------|-----------|-------|
| **Ollama** (default) | None | `nomic-embed-text` | 768 | Free, local. MTEB ~62. |
| **OpenAI** | `OPENAI_API_KEY` | `text-embedding-3-small` / `-large` | 1536 / 3072 (truncatable to 1024) | Best quality/cost balance. Set `EMBEDDING_DIMENSIONS=1024` for the truncated `-large`. |
| **Voyage** | `VOYAGE_API_KEY` | `voyage-3-large` | 1024 | MTEB ~76, Anthropic-recommended. Free tier covers most personal use. |

Auto-detection waterfall (LLM):
1. Explicit `LLM_PROVIDER` env var wins
2. `ANTHROPIC_API_KEY` set → Anthropic
3. `OPENAI_API_KEY` set → OpenAI
4. Ollama reachable → Ollama
5. `claude` CLI installed → Claude Code subscription

Auto-detection waterfall (embeddings):
1. Explicit `EMBEDDING_PROVIDER` env var wins
2. `VOYAGE_API_KEY` set → Voyage
3. Ollama reachable → Ollama
4. `OPENAI_API_KEY` set → OpenAI

Per-task overrides via `provider:model` syntax:

```bash
LLM_EXTRACTION_MODEL=claude-cli:haiku     # cheap extraction
LLM_DECISION_MODEL=anthropic:claude-sonnet-4-6  # accurate AUDM decisions
```

---

## Storage

Sigil runs on **Postgres 13+ with the `pgvector` extension** — no other backend supported as of v0.10.0. The schema is created and managed by Sigil's migrations; `sigil init` auto-bootstraps the database, user, and extension on first run.

Configuration lives in `~/.sigil/.env`:

```
SIGIL_DB_HOST=localhost
SIGIL_DB_PORT=5432
SIGIL_DB_NAME=sigil
SIGIL_DB_USER=sigil_app
SIGIL_DB_PASSWORD=...
```

Re-running `sigil init` is idempotent — it preserves all existing keys and only updates what you re-confirm at the prompts.

### Why Postgres-only

Earlier versions of Sigil supported PGlite (embedded WASM Postgres) as a zero-install option. v0.10.0 dropped it. The reasons:

- **Multi-process / multi-agent.** PGlite is single-process. Two Claude Code windows, or Claude + Cursor + Codex sharing memory, all need real Postgres anyway.
- **One backend to maintain.** Two SQL flavors meant two test paths and two failure modes (e.g., the `glob` import bug, the WASM lock files).
- **Standard tooling.** Postico, pgAdmin, `psql`, normal pg client libraries, RDS-style backups — all just work.

Existing 0.9.x users with PGlite data: see [MIGRATING.md](./MIGRATING.md) for the export/import path. Your `~/.sigil/db/` directory is preserved untouched; v0.10.0 just won't read from it.

### Production / shared / multi-machine

Point your Postgres at any reachable host. Docker, RDS, Neon, Supabase, your home server — Sigil doesn't care. For one Sigil database shared across multiple machines (e.g., your laptop + a desktop running an overnight Sentry-triage agent), each machine's `~/.sigil/.env` points at the same Postgres host. Hot-context and pod-aware retrieval are transactional across clients.

---

## Files Sigil owns

```
~/.sigil/
├── .env                    # Config, API keys, Postgres connection
├── CLAUDE.md               # Instructions + hot-context snapshot for Claude
├── .hook-errors.log        # Append-only diagnostic log read by `sigil doctor`
└── .last-clean-doctor      # Ack timestamp — silences proactive warnings after a clean doctor run

~/.claude/
├── CLAUDE.md               # @import line to ~/.sigil/CLAUDE.md (one line added)
└── settings.json           # UserPromptSubmit + PostToolUse + Stop + SessionEnd hooks (merged, not overwritten)
```

Everything Sigil-specific lives under `~/.sigil/`. Memory itself lives in your Postgres. No files in your project directory. No cloud. Embeddings stay local if you use Ollama; otherwise text leaves your machine only when calling your chosen LLM / embedding provider.

---

## Benchmarks

### Retrieval quality — LongMemEval oracle split

| Metric | Sigil | Notes |
|--------|--------|-------|
| R@1 / R@3 / R@10 | **100% / 100% / 100%** | n=100, oracle split, OpenAI top-quality stack |
| Answer correctness (LLM-judged) | **41%** | Bottlenecked by gpt-4o temporal reasoning, not retrieval |

Honest caveats: oracle split is the easy split (no distractor sessions); n=100 is small; per-question haystack is ~25 chunks. Numbers are not directly comparable to published Mem0 / Zep / Letta runs without identical methodology. Full methodology, failure-mode breakdown, and caveats: [eval/longmemeval/RESULTS.md](./eval/longmemeval/RESULTS.md).

### Local latency

Measured on a real knowledge base (53 docs, 249 facts) on an M-series Mac with Postgres in a local Docker container. These are **local** numbers — they include the Postgres round-trip but not WAN latency, so they aren't directly comparable to cloud-hosted memory services. Listed so you can size your own expectations, not as a competitive claim.

| Metric | Sigil (local) |
|--------|----------------|
| Search latency (avg) | **33ms** |
| Search latency (p95) | **61ms** |
| Keyword recall @5 | **77%** |
| Embedding latency | **26ms** |
| Tokens injected per prompt | **~1.5K** |

Hook hot-path latency (cold Node start + Postgres connect + search) is higher than the raw search latency — typically 200–400ms on first invocation, then warm thereafter while Claude Code keeps the hook process pool alive. We have not formally benchmarked this; see [#hook-performance](#hook-performance) below.

---

## What makes Sigil different

| | Sigil | Mem0 | claude-mem | Obsidian |
|---|--------|------|------------|----------|
| Atomic fact extraction | ✓ | Basic | ✗ (session logs) | ✗ (manual) |
| Entity graph + relationships | ✓ | Paid only | ✗ | Manual |
| Hybrid search (vector + keyword + graph) | ✓ | Vector only | ✗ | Plugin |
| AUDM deduplication | ✓ | ✗ | ✗ | ✗ |
| Fully local (embedded DB) | ✓ | Cloud-first | ✓ (files) | ✓ |
| MCP native | ✓ | ✗ | ✓ | Plugin |
| Auto-integration via hooks | ✓ | ✗ | ✓ | ✗ |
| Zero API key mode | ✓ (claude-cli) | ✗ | ✓ | ✓ |
| Multi-format ingestion | ✓ (md/code/html/json/text) | Conversations only | ✗ | Manual |

---

## FAQ

**Q: Does Sigil work with Cursor / Windsurf / Continue / Cline / ChatGPT desktop?**
A: Yes — anything that speaks MCP can use Sigil's 7-tool server. See [Use with other agents](#use-with-other-agents) for per-client config paths and the JSON snippet to drop in. You lose Claude Code's auto-injection (UserPromptSubmit hook) and auto-saving (Stop hook); your agent calls the MCP tools when it decides to. In practice this means a slightly less invisible experience — the agent has to remember to call `search` and `ingest` — but the underlying memory engine is the same.

**Q: Does my data leave my machine?**
A: No. Everything runs locally by default (PGlite + Ollama). If you pick the OpenAI or Anthropic LLM provider, the text sent for fact extraction leaves your machine during ingestion. Embeddings with Ollama stay local. Claude Code provider uses your existing subscription without extra data egress.

**Q: Can I back up my knowledge base?**
A: Yes. `sigil export --format=json --output=backup.json` exports all facts, entities, and documents. Or copy `~/.sigil/db/` to another machine.

**Q: What happens when my knowledge base gets large?**
A: Vector search on pgvector stays fast up to millions of vectors. Tested with thousands of facts without noticeable slowdown. Use namespaces to scope search when relevant.

**Q: Can I share a knowledge base with a team?**
A: Not yet. v1 is single-user. Team features (shared namespaces, sync) are planned for v2.

**Q: How do I debug when something breaks?**
A: Start with `sigil doctor`. It'll tell you exactly what's wrong — missing provider, hook not registered, DB issue, etc.

<a id="hook-performance"></a>
**Q: What happens to my prompt if the Sigil hook crashes?**
A: Nothing — your prompt still goes through. The `UserPromptSubmit` hook is wrapped in a top-level try/catch that fails silently to stderr and returns an empty `additionalContext`. Claude Code will surface the stderr line but won't block on it. Sigil's design rule: **a broken memory layer must never block a working prompt.** If you see `[sigil:user-prompt-submit]` lines in your terminal, run `sigil doctor`.

**Q: How much latency does the hook add to every prompt?**
A: Cold-path: roughly 200–400ms on first invocation (Node startup + PGlite WASM init + DB open + hybrid search). Warm path is faster, but Claude Code spawns the hook fresh per prompt, so most invocations pay something close to the cold cost. We have not formally benchmarked this end-to-end and the README's "33ms search" figure does **not** include hook overhead — that's just the search call itself. If you find this unacceptable, you can comment the `UserPromptSubmit` hook out of `~/.claude/settings.json` and rely on the hot-context CLAUDE.md + on-demand MCP `search` tool instead.

**Q: How do I uninstall cleanly?**
A: `npm uninstall -g @anmolsrv/sigil` removes the binary. To remove the data and config: `rm -rf ~/.sigil`. To unwire from Claude Code, edit `~/.claude/settings.json` (remove the sigil hook entries) and `~/.claude/CLAUDE.md` (remove the `@~/.sigil/CLAUDE.md` line). A dedicated `sigil uninstall` command is on the roadmap.

---

## Architecture

See [`PROJECT.md`](./PROJECT.md) and [`architecture.html`](./architecture.html) (in the repo) for a full visual breakdown of the ingestion pipeline, search flow, data model, and LLM provider system.

---

## License

ISC. Use it. Fork it. Ship with it.

---

Made by [Anmol](https://github.com/Anmol-Srv). Built because every AI coding session starting from zero was driving me crazy. Started Claude-Code-first because that's where I work; built MCP-native from day one because I expected to switch tools eventually and didn't want to rewrite the memory layer.
