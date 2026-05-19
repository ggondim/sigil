<div align="center">

# Sigil

### Persistent memory for AI coding agents.

One Postgres-backed brain across every agent on your machine. Auto-captured from Claude Code via hooks. Available to Cursor, Codex, Continue, Cline, Windsurf, or anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io/). Shared across machines if you point them at the same Postgres.

```bash
docker run -d --name sigil-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=sigil_dev pgvector/pgvector:pg15
npm install -g @anmolsrv/sigil
sigil init
```

That's the whole setup. Open a Claude Code session — memory is already wired in.

[![npm](https://img.shields.io/npm/v/@anmolsrv%2Fsigil)](https://www.npmjs.com/package/@anmolsrv/sigil)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-native-8B5CF6)](https://modelcontextprotocol.io/)
[![Benchmark](https://img.shields.io/badge/LongMemEval%20oracle-R@10%20100%25-6B1A2A)](./eval/longmemeval/RESULTS.md)
[![License](https://img.shields.io/badge/license-ISC-blue)](https://opensource.org/licenses/ISC)

[**Quickstart**](#quickstart) · [How it's structured](#how-its-structured) · [Other agents](#use-with-other-mcp-clients) · [Cross-machine](#cross-machine-memory) · [Benchmarks](#benchmarks) · [Commands](#commands) · [FAQ](#faq)

</div>

---

## What it does

Every agent starts from zero. You re-explain the same architecture, watch the same mistakes happen, lose hours to context-loading. Sigil is a persistent memory layer that fixes this in three ways:

- **In Claude Code:** four hooks (`UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`) auto-capture decisions, preferences, and observations as you work. Relevant memory is injected into every new prompt before Claude sees it. You write zero `sigil remember` calls.
- **In other MCP clients** — Cursor, Codex, Continue, Cline, Windsurf: the same memory is exposed as a 9-tool MCP server. Your agent calls `search` / `ingest` / etc. when it needs them. No hook layer, but the underlying brain is identical.
- **Across machines:** point multiple installs at the same Postgres. A fact captured on your laptop surfaces in the agent running on your home server. No daemon, no sync protocol — Postgres handles consistency.

---

## How it's structured

Memory lives in **pods** — typed containers with declared retrieval behaviour. Five built-in kinds today:

| Kind | Identity | Decay | Hot-context budget |
|---|---|---|---|
| `claude_session` | one per Claude Code session | 90 days | 6 slots |
| `project` | one per git root (or cwd) | never | 4 slots |
| `person` | one per contact you mention | never | 4 slots (rolling 24h active) |
| `playbook` | your user-authored runbooks | never | 3 slots (active for matching project) |
| `vital` | virtual; facts marked `importance=5` | never | 6 slots (global) |

Pods are pluggable. Adding a new kind (`codex_session`, `slack_channel`, `github_pr`, ...) means writing a contract file — no schema migrations. Retrieval is pod-aware: hot-context blends facts from your active session + project + relevant people + vital, weighted by importance × decay.

Three storage layers underneath:

1. **Chunks** — raw 512-token blocks of ingested docs, embedded via your chosen provider (Ollama / OpenAI / Voyage)
2. **Facts** — atomic statements with confidence, importance, temporal validity, supersession links
3. **Entity graph** — typed nodes (person, project, service, ...) + relations, traversed via recursive CTEs

Retrieval is hybrid: pgvector cosine + tsvector keyword fused via Reciprocal Rank Fusion, then re-ranked by ACT-R activation (recency × frequency) and Hebbian co-retrieval boosts. The full pipeline is in `src/memory/`.

---

## Quickstart

Sigil needs **Postgres 13+ with the `pgvector` extension** running somewhere reachable. You bring the server; `sigil init` does everything else.

### 1. Have Postgres running

```bash
# Recommended — pgvector image includes the extension out of the box
docker run -d --name sigil-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=sigil_dev pgvector/pgvector:pg15
```

Alternatives: `brew install postgresql@15 pgvector && brew services start postgresql@15`, or any managed Postgres with the `vector` extension enabled (RDS, Neon, Supabase, Crunchy, …).

### 2. Install + setup

```bash
npm install -g @anmolsrv/sigil
sigil init
```

`sigil init`:

1. Asks for your LLM provider (OpenRouter, OpenAI, Anthropic, Ollama, or Claude Code subscription).
2. Asks for your embedding provider (OpenAI, Voyage, or Ollama).
3. Asks for your Postgres connection. **If the `sigil` database doesn't exist yet, it asks once for Postgres admin credentials and auto-creates the database, the `sigil_app` user, and the `vector` extension.** Admin creds are used once and never written to disk; only `sigil_app` credentials land in `~/.sigil/.env`.
4. Runs schema migrations.
5. Registers the four hooks in `~/.claude/settings.json` and adds `@~/.sigil/CLAUDE.md` to your global Claude config so hot-context is always loaded.

Re-running `sigil init` is idempotent. Existing `~/.sigil/.env` keys are preserved — only prompted values are updated.

```bash
sigil doctor   # verify everything's wired
```
```
Sigil diagnostic

  ✓ Config file — ~/.sigil/.env
  ✓ Config validation — no provider/model mismatches
  ✓ Database — Postgres @ localhost:5432/sigil
  ✓ Stored data — 0 docs, 0 chunks, 0 facts
  ✓ LLM provider — openrouter (model=google/gemini-flash-latest)
  ✓ Embedding provider — openai / text-embedding-3-large
  ✓ UserPromptSubmit hook — registered
  ✓ PostToolUse hook — registered
  ✓ Stop hook — registered
  ✓ SessionEnd hook — registered
  ✓ Sigil CLAUDE.md
  ✓ Hook errors — none

All checks passed.
```

### 3. Use it

Tell Sigil something once:

```bash
sigil remember "Project uses Postgres LISTEN/NOTIFY for events, not Redis pubsub"
```

Open Claude Code in any project tomorrow. Ask "what's our event delivery setup?" — Claude answers correctly. The `UserPromptSubmit` hook injected the fact before Claude saw your prompt.

In practice you rarely call `sigil remember` directly. The `Stop` hook runs a classifier on every user message and auto-saves anything memorable (preferences, decisions, constraints, factual claims). The `PostToolUse` hook captures observations from Edit/Write/Bash.

---

## Use with other MCP clients

`sigil register --print` outputs the standard MCP config JSON:

```json
{
  "mcpServers": {
    "sigil": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/sigil/dist/server.js", "--mcp"],
      "env": { "DOTENV_CONFIG_PATH": "/Users/you/.sigil/.env" }
    }
  }
}
```

Drop the inner `sigil: {...}` object into your client's MCP config:

| Client | Config file |
|---|---|
| Cursor | `~/.cursor/mcp.json` (or Settings → MCP) |
| Continue.dev | `~/.continue/config.json` |
| Cline (VS Code) | `cline_mcp_settings.json` in your VS Code user dir |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Codex / others | any MCP-spec client |

The agent now sees nine tools: `search`, `search_entity`, `traverse_graph`, `get_fact_context`, `get_entity_context`, `get_pod`, `list_pods`, `status`, `ingest`. Most agents use them well if their system prompt mentions Sigil; if not, a short nudge helps:

> "You have access to a persistent memory system called Sigil. Before answering about projects, preferences, or past decisions, call `sigil_search`. When the user shares preferences, decisions, or constraints, call `sigil_ingest` to save them."

Unlike Claude Code there's no hook layer — the agent decides when to call. Capture relies on the agent or on you running `sigil remember` from the CLI.

---

## Cross-machine memory

Point multiple installs at the same Postgres and they share one brain:

```bash
# Machine 1 (laptop)
SIGIL_DB_HOST=postgres.your-network.local sigil init

# Machine 2 (home server, different OS, doesn't matter)
SIGIL_DB_HOST=postgres.your-network.local sigil init
```

Both machines now share memory. A fact captured on machine 1 surfaces on machine 2's next prompt. Reads and writes go directly to Postgres; consistency is whatever Postgres gives you (which is plenty for personal memory).

Use cases this unlocks:

- **Laptop + desktop.** Same memory across both, no manual sync.
- **Local dev + cloud agent.** Your laptop's Claude Code and a Sentry-triage agent running on a VPS share one brain. The agent writes "fixed prod issue X by patching Y"; your morning prompt sees it.
- **Multi-agent workflows.** Claude Code + Hermes + Codex all hitting the same memory. Each pod kind keeps writes attributed; agents in 0.11.0+ get their own `agent:<name>` pod for write attribution.

---

## Benchmarks

### Retrieval — LongMemEval oracle split

| Metric | Sigil | Notes |
|---|---|---|
| R@1 / R@3 / R@10 | **100% / 100% / 100%** | n=100, oracle split, OpenAI top-quality stack |
| Answer correctness (LLM-judged) | **43%** | Bottlenecked by gpt-4o's temporal reasoning, not Sigil retrieval |
| Cost / Wall time | $0.21 / 37 min | Single n=100 run end-to-end |

Honest caveats in [`eval/longmemeval/RESULTS.md`](./eval/longmemeval/RESULTS.md): oracle is the easy split, n=100 is small, per-question haystack is ~25 chunks. Numbers aren't directly comparable to Mem0 / Zep / Letta runs without identical methodology. The retrieval ceiling is essentially the embedding model's quality at this scale; Sigil's architectural work (Hebbian, ACT-R, pod-aware blending) shows more at 10K+ chunks.

### Local latency

| Metric | Sigil (local Postgres) |
|---|---|
| Search latency (avg / p95) | 33ms / 61ms |
| Embedding latency | 26ms |
| Tokens injected per prompt | ~1.5K |

Hook hot-path latency (cold Node start + Postgres connect + search) is higher — 200-400ms on first invocation, then warm. If that's unacceptable, comment the `UserPromptSubmit` hook out of `~/.claude/settings.json` and rely on the hot-context `CLAUDE.md` snapshot + on-demand MCP `search`.

---

## Commands

| Command | Description |
|---|---|
| `sigil init` | Interactive setup — providers, Postgres, hooks |
| `sigil doctor` | Diagnose config, DB, providers, hook registration, error budget |
| `sigil remember "text" [--bg]` | Save fact(s) directly. `--bg` returns immediately |
| `sigil ingest <file\|url\|glob>` | Ingest one or many documents |
| `sigil search "query" [--pod-scope=auto\|global\|<name>]` | Search the brain |
| `sigil why "query"` | Explain a search — per-fact RRF / pod / kind / importance breakdown |
| `sigil kind list` / `sigil kind show <name>` | Inspect registered pod kinds |
| `sigil pod list / show / create / archive / delete` | Manage pods |
| `sigil session list / current / show <uid>` | Inspect Claude Code session pods |
| `sigil facts [--limit=N]` | List stored facts with IDs |
| `sigil forget <id>` | Delete a fact |
| `sigil context [--explain]` | Refresh / explain the hot-context snapshot |
| `sigil status` | KB statistics |
| `sigil namespace list / delete <ns> --confirm` | Manage namespaces |
| `sigil export [--format=json\|markdown]` | Export everything |
| `sigil migrate` | Run pending DB migrations |
| `sigil reset --confirm` | Drop all data (destructive) |
| `sigil register [--print]` | (Re)register the MCP server |

---

## Providers

Sigil supports five LLM providers and three embedding providers with automatic detection.

### LLM

| Provider | API key | Notes |
|---|---|---|
| **OpenRouter** | `OPENROUTER_API_KEY` | One key, namespaced models (Anthropic / OpenAI / Meta / Google / ...). Default model: `google/gemini-flash-latest`. |
| **Anthropic** | `ANTHROPIC_API_KEY` | Direct Claude access; pinned model defaults |
| **OpenAI** | `OPENAI_API_KEY` | Cheapest API option (gpt-4o-mini) |
| **Ollama** | none | Fully local, runs on your machine |
| **Claude Code** (`claude-cli`) | none | Uses your existing Claude Code subscription |

OpenRouter init has an opt-in "Advanced overrides" step that pre-fills a smart split: cheap model for high-volume extraction, Sonnet for AUDM decisions and read-time synthesis.

### Embeddings

| Provider | API key | Default model | Dim | Notes |
|---|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | `text-embedding-3-large` | 1024 (truncated) | Best quality/cost |
| **Voyage** | `VOYAGE_API_KEY` | `voyage-3-large` | 1024 | MTEB ~76, Anthropic-recommended |
| **Ollama** | none | `nomic-embed-text` | 768 | Free, local |

### Auto-detection waterfall

**LLM:** `LLM_PROVIDER` env > OpenRouter key > Anthropic key > OpenAI key > Ollama reachable > `claude` CLI installed.

**Embeddings:** `EMBEDDING_PROVIDER` env > Voyage key > Ollama reachable > OpenAI key.

### Per-task overrides

Route specific tasks through different models via the `provider:model` syntax:

```bash
LLM_OPENROUTER_MODEL=google/gemini-flash-latest            # default everywhere
LLM_EXTRACTION_MODEL=openrouter:qwen/qwen3.5-flash         # cheap, called per chunk
LLM_DECISION_MODEL=openrouter:anthropic/claude-sonnet-latest  # smart AUDM
SIGIL_SYNTH_MODEL=openrouter:anthropic/claude-sonnet-latest   # smart synthesis
```

---

## Files Sigil owns

```
~/.sigil/
├── .env                     # Config, API keys, Postgres connection
├── CLAUDE.md                # Instructions + hot-context snapshot
├── .hook-errors.log         # Append-only diagnostic log
└── .last-clean-doctor       # Ack timestamp for proactive warnings

~/.claude/
├── CLAUDE.md                # @import line to ~/.sigil/CLAUDE.md (one line added)
└── settings.json            # 4 hook entries (merged, not overwritten)
```

Memory itself lives in your Postgres. Embeddings stay local if you use Ollama; otherwise text leaves your machine only when calling your chosen LLM / embedding API.

---

## FAQ

**Q: Does it work with Cursor / Codex / Windsurf / Continue / Cline?**
A: Yes — anything that speaks MCP can use Sigil. See [Use with other MCP clients](#use-with-other-mcp-clients). You lose Claude Code's auto-injection and auto-saving (the four hooks); your agent calls the MCP tools when it decides to. The memory engine is identical.

**Q: Does my data leave my machine?**
A: It depends on your providers. Memory storage is your own Postgres. Embeddings with Ollama stay local. The LLM call (for fact extraction, AUDM decisions, synthesis) sends text to whichever provider you picked — OpenRouter, OpenAI, Anthropic, or Ollama-local. Pick all-local (Ollama LLM + Ollama embeddings) for zero data egress.

**Q: Can I back up the brain?**
A: `sigil export --format=json --output=backup.json` exports facts, entities, pods, and documents. Or take a Postgres dump (`pg_dump sigil > sigil.sql`). To restore on a new machine: `pg_restore` then `sigil migrate` then `sigil init` (to set up the env).

**Q: Multi-user / team support?**
A: Single-user for now. Multiple installs sharing one Postgres works (see [Cross-machine memory](#cross-machine-memory)) but write attribution and ACLs (each pod is private / shared / public) land in 0.11.0+ along with the `agent` kind.

**Q: What happens if a hook crashes?**
A: Your prompt still goes through. Every hook wraps in a top-level try/catch that fails silently — Sigil's invariant is **a broken memory layer must never block a working prompt.** Errors append to `~/.sigil/.hook-errors.log`; `sigil doctor` surfaces them. After 5 unacked errors in 24h, `sigil doctor` exits with code 1 so CI / scripts can catch it.

**Q: How do I uninstall cleanly?**
A: `npm uninstall -g @anmolsrv/sigil` removes the binary. `rm -rf ~/.sigil` removes data and config. Unwire from Claude Code by removing the sigil hook entries from `~/.claude/settings.json` and the `@~/.sigil/CLAUDE.md` line from `~/.claude/CLAUDE.md`. The Postgres database (`sigil`) and user (`sigil_app`) survive — drop them yourself if you want them gone.

**Q: Where can I see how the retrieval pipeline actually works?**
A: Read `src/memory/search/hybrid.js` (entry point) and `src/memory/search/hybrid-sql.js` (the single-SQL RRF + ACT-R activation query). The pod kind registry contracts are in `src/memory/pods/kinds/`. Hooks are in `src/hooks/`.

---

## License

ISC. See [LICENSE](./LICENSE).
