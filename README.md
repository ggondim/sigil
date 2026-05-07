<div align="center">

# Sigil

### Persistent memory for Claude Code.<br/>Local-first. Zero-cloud. Two commands to install.

Claude doesn't remember what you decided yesterday. Sigil does.<br/>
Every prompt, every session — your context is already there.

```bash
npm install -g sigil
sigil init
```

[![npm](https://img.shields.io/npm/v/sigil)](https://www.npmjs.com/package/sigil)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-native-8B5CF6)](https://modelcontextprotocol.io/)
[![Benchmark](https://img.shields.io/badge/LongMemEval%20oracle%20n%3D100-R@10%20100%25-6B1A2A)](./eval/longmemeval/RESULTS.md)
[![License](https://img.shields.io/badge/license-ISC-blue)](https://opensource.org/licenses/ISC)

[**Quickstart**](#quickstart) · [How it works](#how-it-works) · [Benchmarks](#benchmarks) · [Commands](#commands) · [FAQ](#faq)

</div>

---

## The 30-second demo

```bash
# Tell Sigil something once
sigil remember "We use canary deploys: 5% for 30min, then 25%, then full cutover. Rollback via LaunchDarkly killswitch."

# Open a brand-new Claude Code session in any project. Ask it:
#   "What's our deployment strategy?"

# Claude answers immediately — Sigil auto-injected the fact via the
# UserPromptSubmit hook before Claude ever saw your prompt.
```

That's the whole pitch. **One command to remember. Zero commands to recall.** The hook handles it.

---

## What you actually get

- **Persistent memory** across every Claude Code session, every project, every day
- **Hybrid retrieval** — vector + keyword fused via Reciprocal Rank Fusion, with optional read-time synthesis. **R@10 = 100%** on LongMemEval oracle split (n=100, ~25 chunks per haystack — full caveats in [RESULTS.md](./eval/longmemeval/RESULTS.md))
- **Local-first** — embedded PGlite or real Postgres, your choice. No cloud. No telemetry. No vendor lock-in.
- **Free by default** — Ollama embeddings + Claude Code subscription. No API keys required to start. Voyage / OpenAI / Anthropic supported as paid upgrades for top-tier quality.
- **Native Claude Code integration** — `UserPromptSubmit` hook injects relevant memory before every prompt; `PostToolUse` hook silently captures decisions; MCP tools for direct agent control
- **Three-layer knowledge model** — chunks (raw text), facts (atomic statements with confidence/importance/temporal validity), entity graph (typed nodes + relations). Not a flat vector store.

---

## Why it exists

Every time you open Claude Code, it starts from zero. You re-explain the same architecture, watch Claude repeat mistakes you corrected last week, lose hours to context-loading that should be instant.

Sigil is a thin local layer that fixes this. It runs invisibly via Claude Code hooks and the Model Context Protocol — your memory is just *there*, in every session, on every machine you install it on.

No cloud, no subscription, no API key required (with your Claude Code subscription).

---

## Quickstart

```bash
# Install globally
npm install -g sigil

# One-time setup (30 seconds)
sigil init

# That's it. Open Claude Code and start a new session.
```

`sigil init` runs an interactive wizard that:
1. Asks for your LLM provider (Claude Code subscription is default — zero API key needed)
2. Sets up a local PGlite database at `~/.sigil/db` (no Docker, no Postgres server)
3. Registers hooks in `~/.claude/settings.json` so Claude auto-uses memory
4. Adds `@~/.sigil/CLAUDE.md` to your global Claude config

No other steps. No cloud setup.

```bash
# Verify everything works
sigil doctor
```

```
Sigil diagnostic

  ✓ Config file — ~/.sigil/.env
  ✓ Database — PGlite (~/.sigil/db)
  ✓ Stored data — 53 docs, 47 chunks, 249 facts
  ✓ LLM provider — claude-cli (Claude Code subscription)
  ✓ Embedding provider — ollama / nomic-embed-text
  ✓ UserPromptSubmit hook — registered
  ✓ PostToolUse hook — registered
  ✓ Sigil CLAUDE.md — ~/.sigil/CLAUDE.md

All checks passed.
```

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

Sigil integrates with Claude Code in three complementary ways:

### 1. Hooks (automatic, invisible)

`sigil init` registers two hooks in `~/.claude/settings.json`:

- **`UserPromptSubmit`** — On every user prompt, searches Sigil for relevant facts and injects them as `additionalContext`. Claude sees the memory automatically.
- **`PostToolUse`** — On every Edit/Write/Bash, captures a lightweight observation in the background.

No `! sigil search` or `! sigil remember` commands needed. Memory is invisible.

### 2. Hot context (passive)

`sigil init` writes a top-20 hot-facts snapshot to `~/.sigil/CLAUDE.md`, auto-imported into every Claude session via `@~/.sigil/CLAUDE.md` in `~/.claude/CLAUDE.md`. Facts are ranked by importance × access count × recency.

Refreshed automatically after every `sigil remember` and `sigil ingest`. Manual refresh:

```bash
sigil context
```

### 3. MCP tools (on-demand)

Sigil registers as an MCP server with 7 tools for deep knowledge access:

| Tool | Purpose |
|------|---------|
| `search` | Hybrid search across all facts and chunks |
| `search_entity` | Find entities by name or type |
| `traverse_graph` | Navigate entity relationships (neighbors / path / related) |
| `get_fact_context` | Full detail on a fact (provenance, source document, entities) |
| `get_entity_context` | Full detail on an entity (relations, facts, mentions) |
| `status` | Knowledge base statistics |
| `ingest` | Ingest content via Claude |

To register:

```bash
sigil register
```

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
| `sigil register` | Register as a Claude Code MCP server |

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

Sigil defaults to **PGlite** — embedded WASM Postgres in `~/.sigil/db/`. No server, no port, no Docker. Right choice for personal single-developer use.

For Postico/pgAdmin visibility, multi-process concurrency, or shared deployments, switch to **real Postgres**:

```
# ~/.sigil/.env
SIGIL_DB_TYPE=postgres
SIGIL_DB_HOST=localhost
SIGIL_DB_PORT=5432
SIGIL_DB_NAME=sigil
SIGIL_DB_USER=sigil_app
SIGIL_DB_PASSWORD=...
```

Then `sigil migrate` to create the schema in your Postgres instance.

Full setup walkthrough (Homebrew, Docker, troubleshooting): [`docs/postgres.md`](docs/postgres.md).

### When to switch to real Postgres

PGlite is a **single-process** embedded database. Only one Sigil process can hold the DB at a time. In practice that means:

- A `sigil` CLI invocation while the MCP server is running for an active Claude Code session **will fail** ("DB busy"). Stop the session, or run the CLI in a different namespace.
- Two Claude Code windows open against the same Sigil DB → only one will get the hook to fire cleanly. The other's hook will fail-fast and inject nothing.
- If a process is killed hard (`kill -9`, OOM), the DB lock can be left dangling: `sigil doctor --kill-stale`.

If any of those describe your workflow, run real Postgres instead. PGlite is the right default for a single developer with one active session at a time. It is **not** the right backend for: parallel agent fleets, shared dev machines, or anything that wants Postico/pgAdmin visibility.

---

## Files Sigil owns

```
~/.sigil/
├── .env              # Config, API keys (if any), namespace
├── db/               # PGlite embedded database (auto-created)
└── CLAUDE.md         # Instructions + hot-context snapshot for Claude

~/.claude/
├── CLAUDE.md         # @import line to ~/.sigil/CLAUDE.md (one line added)
└── settings.json     # UserPromptSubmit + PostToolUse hooks (merged, not overwritten)
```

Everything lives under `~/.sigil/`. No files in your project directory. No cloud. No external services (except Ollama for embeddings if you choose it).

---

## Benchmarks

### Retrieval quality — LongMemEval oracle split

| Metric | Sigil | Notes |
|--------|--------|-------|
| R@1 / R@3 / R@10 | **100% / 100% / 100%** | n=100, oracle split, OpenAI top-quality stack |
| Answer correctness (LLM-judged) | **41%** | Bottlenecked by gpt-4o temporal reasoning, not retrieval |

Honest caveats: oracle split is the easy split (no distractor sessions); n=100 is small; per-question haystack is ~25 chunks. Numbers are not directly comparable to published Mem0 / Zep / Letta runs without identical methodology. Full methodology, failure-mode breakdown, and caveats: [eval/longmemeval/RESULTS.md](./eval/longmemeval/RESULTS.md).

### Local latency

Measured on a real knowledge base (53 docs, 249 facts) on an M-series Mac. Sigil runs in-process against an embedded PGlite database, so these are **local** numbers — not directly comparable to numbers from cloud-hosted memory services, which include network round-trip. Listed here so you can size your own expectations, not as a competitive claim.

| Metric | Sigil (local) |
|--------|----------------|
| Search latency (avg) | **33ms** |
| Search latency (p95) | **61ms** |
| Keyword recall @5 | **77%** |
| Embedding latency | **26ms** |
| Tokens injected per prompt | **~1.5K** |

Hook hot-path latency (cold Node start + PGlite WASM init + DB connect + search) is higher — typically 200–400ms on first invocation, then warm thereafter while Claude Code keeps the hook process pool alive. We have not formally benchmarked this; see [#hook-performance](#hook-performance) below.

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

**Q: Does Sigil work with Cursor / Windsurf / other MCP clients?**
A: The MCP interface works with any MCP client. The hooks are Claude Code specific. Cursor integration requires manual MCP registration.

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
A: `npm uninstall -g sigil` removes the binary. To remove the data and config: `rm -rf ~/.sigil`. To unwire from Claude Code, edit `~/.claude/settings.json` (remove the sigil hook entries) and `~/.claude/CLAUDE.md` (remove the `@~/.sigil/CLAUDE.md` line). A dedicated `sigil uninstall` command is on the roadmap.

---

## Architecture

See [`PROJECT.md`](./PROJECT.md) and [`architecture.html`](./architecture.html) (in the repo) for a full visual breakdown of the ingestion pipeline, search flow, data model, and LLM provider system.

---

## License

ISC. Use it. Fork it. Ship with it.

---

Made by [Anmol](https://github.com/Anmol-Srv). Built because every AI coding session starting from zero was driving me crazy.
