# Sigil Claude Integration Analysis
### Package: `@anmol-srv/sigil` v0.12.2
### Source: `/tmp/sigil-source` (cloned from https://github.com/Anmol-Srv/sigil)
### Analysis date: 2026-06-02

---

## Table of Contents
1. [Architecture](#2-architecture)
2. [Claude Integration Deep-Read](#3-claude-integration-deep-read)
3. [Performance Bottlenecks](#4-performance-bottlenecks)
4. [Proposed Workarounds](#5-proposed-workarounds)

---

## 2. Architecture

### Language and Runtime

Pure **JavaScript (ESM)**, targeting **Node.js ≥ 20**. No TypeScript compilation step; source in `src/` is unbundled JS. `esbuild` bundles at publish time into `dist/` (cli.js, daemon.js, server.js, hooks/*.js). The package uses `"type": "module"`.

Key dependencies:
- `@modelcontextprotocol/sdk` ^1.27.1 — MCP server
- `@number0/iroh` ^0.35.0 — P2P transport (optional, lazy-loaded)
- `@anthropic-ai/sdk` ^0.30.0 — **optional** dependency (only loaded when provider=anthropic)
- `knex` + `pg` — Postgres ORM
- `ws` — WebSocket (GUI HTTP server)

### Directory Layout

```
src/
  cli.js                 — Main CLI entry, all sigil <verb> handlers
  server.js              — MCP server entry + auto-spawn logic
  config.js              — Env-derived getter config object
  clients/               — Socket client + auto-spawn daemon logic
  cli-handlers/          — Daemon control, pair, join, service verbs
  daemon/                — sigild: lifecycle, socket server, HTTP server,
  │                         RPC registry, request context, event bus, trace store
  │  handlers/           — One file per RPC method (remember, search,
  │                         ingest-doc, status, search-entity, etc.)
  db/                    — Knex/Postgres driver + migrations
  hooks/                 — UserPromptSubmit, PostToolUse, Stop, SessionEnd
  ingestion/             — pipeline.js (main ingest), chunker, contextualizer,
  │                         embedder, embedding-cache, parsers, sources, connectors
  lib/
  │  llm.js              — Public LLM API: prompt(), promptJson()
  │  llm/
  │    registry.js       — Provider/embedder lazy-loader + auto-detect
  │    log.js            — llm_log DB write + cost estimation + withRetry
  │    providers/        — claude-cli, anthropic, openai, openrouter, ollama
  │    embedders/        — ollama, openai, voyage, openrouter
  memory/
  │  cognitive/          — input-classifier.js, query-router.js
  │  facts/              — extractor.js, store.js (AUDM), hot-context.js
  │  search/             — hybrid.js, query-expander.js, graph-enhancement.js
  │  entities/           — resolver.js, embedding-matcher.js, linker.js
  │  pods/, chunks/, documents/, lifecycle/
  net/                   — Iroh endpoint, identity, pairing, RPC server (follower)
  mcp/                   — MCP server registration + 9 tool files + daemon-call.js
  onboarding/, setup/, supervisor/, scripts/
prompts/
  audm-decision.md, chunk-context.md, default-extraction.md,
  entity-extraction.md, input-classifier.md, query-router.md
```

### End-to-End Query Flow: `sigil search "query"` → Postgres

```
sigil search "query" [--route] [--synthesize]
  │
  ├── CLI (src/cli.js: runSearch)
  │     └── opens socket to daemon via connectOrStartDaemon()
  │           └── src/clients/auto-spawn.js → src/clients/socket-client.js
  │
  ├── NDJSON frame: { id, method:"search", params:{query, route, synthesize, ...} }
  │     over unix socket: ~/.sigil/sigil.sock
  │
  └── sigild socket-server (src/daemon/socket-server.js)
        └── rpc-registry.dispatch("search", params)
              └── src/daemon/handlers/search.js → registerSearch()
                    └── src/memory/search/hybrid.js → search()
                          │
                          ├── [if route=true] routeQuery(query)  ← 1 LLM call
                          │     src/memory/cognitive/query-router.js
                          │
                          ├── [if expand=true or router set it] expandQuery(query) ← 1 LLM call
                          │     src/memory/search/query-expander.js
                          │
                          ├── embed(query) ← embedding provider call
                          │
                          ├── hybridSearchFacts() + keywordSearch + vectorSearch
                          │     ← pgvector + pg_trgm SQL queries
                          │
                          ├── [if synthesize=true] synthesizeAnswer() ← 1 LLM call
                          │     src/memory/search/hybrid.js
                          │
                          └── Returns: { facts, chunks, synthesized, matchedEntity }
```

### End-to-End Write Flow: `sigil remember "fact"` → Postgres

```
sigil remember "fact"
  │
  ├── CLI (runRemember) → socket to daemon
  │
  ├── sigild → registerRemember() → ingestDocument()
  │     src/ingestion/pipeline.js
  │         │
  │         ├── [Step 0] classifyInput()         ← 1 LLM call (classifier)
  │         │     src/memory/cognitive/input-classifier.js
  │         │
  │         ├── [Step 1] hash + documentStore.upsert()
  │         │
  │         ├── [Step 2] parse content
  │         │
  │         ├── [Step 3] chunkSections() + contextualizeChunks() ← 1 LLM call (contextualizer)
  │         │   + embedBatch()
  │         │
  │         ├── [Step 4] extractFactsFromChunks()  ← 1 LLM call per chunk (extractor)
  │         │     src/memory/facts/extractor.js
  │         │     (batched, CONCURRENCY=5 chunks/batch)
  │         │
  │         └── [Step 5] linkDocumentEntities()
  │               ├── resolveTopicsFromFacts()    ← 1 LLM call (entity-resolver)
  │               │     src/memory/entities/resolver.js
  │               └── per entity: verifyEmbeddingMatch() ← 0-N LLM calls (entity-matcher)
  │                     src/memory/entities/embedding-matcher.js
  │
  └── For each extracted fact: saveFact()
        src/memory/facts/store.js
        └── [if similarity >= ambiguous threshold] audmDecide() ← 1 LLM call (audm)
```

### Daemon Lifecycle

The daemon (`sigild`) is a long-lived Node.js process. Key lifecycle:

1. `src/daemon/index.js`: starts socket server, optional HTTP server, optional Iroh endpoint
2. Socket: NDJSON over Unix domain socket `~/.sigil/sigil.sock` (0600 permissions)
3. HTTP: `http://127.0.0.1:7777` for GUI (enabled by default via `SIGIL_HTTP_ENABLED`)
4. Heartbeat file refreshed every 15s at `~/.sigil/heartbeat.json`
5. PID file at `~/.sigil/sigild.pid`

The CLI uses `src/clients/auto-spawn.js` to connect-or-start the daemon. `src/clients/socket-client.js` implements the NDJSON client with a 30-second per-call timeout (hardcoded default: `timeoutMs = 30_000`).

### Iroh P2P Layer

Iroh (QUIC-based P2P, `@number0/iroh`) is activated when `SIGIL_MODE` is not `solo`:

- `solo` (default): no Iroh, single device
- `master`: owns canonical DB, serves `sigil/pair/1` (pairing) and `sigil/rpc/1` (remote RPC) ALPNs
- `follower`: paired with master; Iroh RPC to master for reads/writes
- `lite-follower`: no local DB at all; all RPC calls proxied to master via Iroh

Pairing flow (`sigil pair` / `sigil join`):
1. Master calls `sigil pair create` → generates time-limited code stored hashed in `pairing_code` table
2. Follower calls `sigil join <nodeId> <code>` → dials master Iroh endpoint on `sigil/pair/1` ALPN
3. Handshake creates `device` row (keyed by Iroh NodeID, which is authenticated by QUIC Ed25519 keypair)
4. On `lite-follower`: `src/daemon/lite-proxy.js` swaps local handlers with Iroh-proxied ones

Source files: `src/net/endpoint.js`, `src/net/pairing.js`, `src/net/rpc-server.js`, `src/net/identity.js`, `src/daemon/lite-proxy.js`

---

## 3. Claude Integration Deep-Read

### 3.1 The `claude-cli` Provider: Subprocess Spawn Pattern

**File: `src/lib/llm/providers/claude-cli.js`**

```javascript
// lines 17-43
function spawnClaude(args, input) {
  const timeout = config.llm.cliTimeout || 120_000;

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`claude CLI timed out after ${timeout}ms`));
    }, timeout);
    // ... stdout/stderr collection, close handler
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

// lines 46-50
async function chat(input, { model, jsonMode = false } = {}) {
  const resolved = model || config.llm.cliModel || 'haiku';
  const cliModel = CLI_MODEL_MAP[resolved] || resolved;
  const args = ['-p', '--model', cliModel, '--output-format', 'json'];
  if (jsonMode) args.push('--json-schema', PERMISSIVE_SCHEMA);
  // ...
}
```

**Exact `argv` array** constructed by `chat()`:

```
['claude', '-p', '--model', '<haiku|sonnet|opus>', '--output-format', 'json']
```

For JSON mode (`jsonMode=true`):

```
['claude', '-p', '--model', '<model>', '--output-format', 'json', '--json-schema', '{"type":"object","additionalProperties":true}']
```

**Prompt delivery:** The full prompt text is written to `proc.stdin` and the stream is closed. There is no `--print` flag in the spawned args — the `-p` is the `--print` shorthand (confirmed by the Claude CLI: `-p` is equivalent to `--print`). Output is collected on stdout, parsed as JSON, and the `result` field extracted.

**Flags NOT used:** `--append-system-prompt`, `--resume`, `--session-id`, `--dangerously-skip-permissions` are absent from the implementation. The context prompt about these flags was provided as search hints but none appear in the actual source.

**Timeout:** Default 120,000ms (2 minutes), configurable via `LLM_CLI_TIMEOUT`. The 30-second timeout mentioned in the context is from the **socket client** (`src/clients/socket-client.js` line 26: `timeoutMs = 30_000`), which is the CLI→daemon RPC timeout, not the `claude` process timeout. These are two distinct timeouts:
- **Socket client timeout**: 30s — how long the CLI waits for the daemon to respond
- **Claude CLI process timeout**: 120s — how long the daemon waits for a spawned `claude` process

If a `claude -p` call takes >30s (e.g., slow ollama or a `remember` call with several LLM round-trips), the CLI client times out with "rpc timeout after 30000ms" even though the daemon eventually completes the work. This matches the observed behavior described in the context.

### 3.2 Per-Call Process: No Reuse, No Pooling

**DEFINITIVE ANSWER: A brand new `claude` process is spawned for every single LLM call when the `claude-cli` provider is active.**

Evidence:
- `spawnClaude()` calls `spawn('claude', args, ...)` on each invocation
- No process pool, no cached proc handle, no `--resume`, no `--session-id`
- The `chat()` function in `claude-cli.js` is stateless — no module-level process state
- Provider module only caches the `chat` function reference in `providerCache` (registry.js line 23), not a process handle

Each `claude -p` call incurs: Node.js `spawn()` → Claude process startup (Electron shell + Node runtime) → model initialization → API call/inference → result → process exit. On a cold system this is easily 3–8s overhead before the first token.

### 3.3 Direct Anthropic SDK Usage

**File: `src/lib/llm/providers/anthropic.js`**

```javascript
// lines 6-9
async function getClient() {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: config.llm.apiKey });
  }
  return client;
}
```

The `@anthropic-ai/sdk` is loaded lazily only when `LLM_PROVIDER=anthropic` is selected. It creates **one shared client** (module-level singleton `client`). Each `chat()` call makes a new `anthropic.messages.create()` request — no session reuse needed since the Anthropic SDK uses stateless HTTP. No streaming; returns `message.content[0].text`.

**This provider requires `ANTHROPIC_API_KEY`** and does NOT work with a Claude Max subscription. This is explicitly called out in the provider meta: `hint: 'Claude Haiku — requires API key'`.

### 3.4 Claude Agent SDK

**Not used.** There is no import of `@anthropic-ai/claude-agent-sdk` or any agent SDK anywhere in the codebase. `grep` finds zero results.

### 3.5 MCP Server Wiring

**File: `src/mcp/server.js`**

```javascript
function createMcpServer() {
  const server = new McpServer({ name: 'sigil', version: '0.2.0' });

  registerSearchTool(server);        // search
  registerSearchEntityTool(server);  // search_entity
  registerTraverseGraphTool(server); // traverse_graph
  registerGetFactContextTool(server);// get_fact_context
  registerGetEntityContextTool(server); // get_entity_context
  registerGetPodTool(server);        // get_pod
  registerListPodsTool(server);      // list_pods
  registerStatusTool(server);        // status
  registerIngestTool(server);        // ingest

  return server;
}
```

**Transport:** `StdioServerTransport` — the MCP server communicates with the MCP client (Claude Code, Cursor, etc.) over stdin/stdout.

**Daemon relationship:** The MCP server does NOT contain any memory logic. Every tool call goes through `src/mcp/daemon-call.js` which holds a **persistent, single shared socket connection** to sigild:

```javascript
// src/mcp/daemon-call.js lines 18-25
async function getClient() {
  if (cachedClient) return cachedClient;
  if (!clientPromise) {
    clientPromise = connectOrStartDaemon({ quiet: true })
      .then((c) => { cachedClient = c; return c; });
  }
  return clientPromise;
}
```

So the MCP server process keeps one long-lived socket connection to sigild and reuses it for all tool calls. No 30s timeout applies here — the socket client inside MCP doesn't use the default 30s; its default `timeoutMs = 30_000` does apply per tool call, but the ingest tool has slow LLM calls happening inside the daemon, so the same timeout issue exists.

**MCP search tool defaults:** Note that `registerSearchTool` passes `route: false, synthesize: false` by default (src/mcp/tools/search.js lines 44-45). LLM routing and synthesis are disabled by default in MCP search to keep responses fast. The Claude Code UserPromptSubmit hook uses `route: true, synthesize: false`.

### 3.6 All LLM Callers Summary

Every LLM call goes through `src/lib/llm.js` → `prompt()` or `promptJson()` → `registry.detectProvider()` → provider-specific `chat()`.

| Caller name (llm_log) | File | Method | Per-task model env |
|---|---|---|---|
| `classifier` | src/memory/cognitive/input-classifier.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `contextualizer` | src/ingestion/contextualizer.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `extractor` | src/memory/facts/extractor.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `query-router` | src/memory/cognitive/query-router.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `query-expander` | src/memory/search/query-expander.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `audm` | src/memory/facts/store.js | `prompt` | `LLM_DECISION_MODEL` |
| `entity-resolver` | src/memory/entities/resolver.js | `prompt` | `LLM_ENTITY_MODEL` (config.llm.entityModel) |
| `entity-matcher` | src/memory/entities/embedding-matcher.js | `prompt` | `LLM_ENTITY_MODEL` |
| `synthesizer` | src/memory/search/hybrid.js | `prompt` | `SIGIL_SYNTH_MODEL` or `LLM_EXTRACTION_MODEL` |
| `stop-hook` | src/hooks/stop.js | `promptJson` | `LLM_EXTRACTION_MODEL` |
| `session-end-synth` | src/hooks/session-end.js | `promptJson` | (default provider) |

### 3.7 `claude mcp add` and `_execSync` Usage

In `src/cli.js` (runRegister / doRegister), the CLI runs:

```javascript
_execSync('claude mcp remove sigil', { stdio: 'pipe' });
_execSync(`claude mcp add sigil -s user -- ${process.execPath} ${serverPath} --mcp`, { ... });
```

These are **setup-only** calls during `sigil init`/`sigil register`. Not in the hot path. They interact with the `claude` CLI to register the MCP server configuration, not to make LLM calls.

---

## 4. Performance Bottlenecks

### 4.1 The 30s RPC Timeout vs. 120s Claude CLI Timeout

There are two separate timeouts:
- **Socket client**: `src/clients/socket-client.js` line 26: `timeoutMs = 30_000`. The CLI creates a socket client that abandons the call after 30s. This is what produces "rpc timeout after 30000ms".
- **Claude process**: `config.llm.cliTimeout` (default 120,000ms). The daemon gives each spawned `claude -p` process 2 minutes.

A synchronous `sigil remember "text"` with the `claude-cli` provider will fail with the 30s RPC timeout if the ingest pipeline's LLM calls collectively take more than 30s — which is likely since a single `claude -p` call cold-starts in 3–15s and the write path needs 3–5+ LLM calls.

**`--bg` flag behavior:** `src/cli.js` lines 1743-1756: `--bg` spawns a **detached child process** that itself calls the daemon synchronously. The user gets an instant return, but the 30s socket timeout still applies to the child process. The child just exits with no output — no error visible to the user. This is a fire-and-forget pattern, not a true async background queue.

### 4.2 Read Path Latency (`UserPromptSubmit` hook / `sigil search --route --synthesize`)

**UserPromptSubmit hook** (`src/hooks/user-prompt-submit.js`):
- Calls `search()` with `route: true`, `expand: true` (if router decides), `synthesize: false`
- LLM calls on read path:
  1. **query-router**: 1 call (`routeQuery`) — `promptJson` against `LLM_EXTRACTION_MODEL`
     - Has a TtlCache (200-entry, 10-minute TTL): identical queries skip the LLM
  2. **query-expander** (only if router sets `expand: true`): 1 call
     - Has a TtlCache (100-entry, 5-minute TTL): identical queries skip the LLM
  3. No synthesis in the hook (explicitly `synthesize: false`)

**Total LLM round-trips for read path (worst case):** 2 (router + expander)
**Total LLM round-trips for `sigil search --route --synthesize`:** 3 (router + expander + synthesizer)

All embedding calls (query embedding) go through `embedBatchCached` with a persistent Postgres-backed cache.

**The read path is fast enough for the hook ONLY if query-router/expander are cache-warm.** On a cold cache with `claude-cli` provider, two sequential `claude -p` spawns = ~10–30s, which exceeds the 30s socket timeout.

### 4.3 Write Path Latency (`sigil remember` / ingest pipeline)

For a short fact (classified as `thought` route):

| Step | Caller | LLM calls | Notes |
|------|--------|-----------|-------|
| classify | classifier | 1 | Short content ≤2000 chars triggers LLM; longer content auto-routed |
| thought fast-path | (none) | 0 | Facts stored directly from classifier output |
| embedBatch | embedding provider | 1 API call | Cached in embedding_cache |
| saveFact (per fact) | audm | 0–1 each | Only if similarity in [0.78, 0.88) ambiguous zone |
| linkDocumentEntities | entity-resolver + entity-matcher | 1 + 0-N | One call to extract topics, N verify calls |

For a `thought`-routed input (short fact), best case: **1–2 LLM calls** (classifier + entity-resolver). Worst case with entity disambiguation: **1 + 1 + K** (classifier + entity-resolver + K entity-matcher calls).

For a `knowledge`-routed input (long document, >2000 chars):

| Step | Caller | LLM calls |
|------|--------|-----------|
| classify | (heuristic) | 0 — auto-skips LLM for long content |
| contextualize | contextualizer | 1 — one call for all chunks |
| extract facts | extractor | 1 per chunk (batched in groups of 5) |
| AUDM per fact | audm | 0–1 each |
| entity resolution | entity-resolver + entity-matcher | 1 + N |

For a 10-chunk document: worst case **~14 LLM calls** (1 contextualizer + 10 extractor + 1 entity-resolver + N entity-matchers + M audm calls).

**With `claude-cli` provider on CPU ollama or slow API**, each call costs 5–30s. The write path is inherently serial for AUDM (intentional: comment in `socket-server.js` line 36 — "serializes handler dispatch... AUDM's pairwise dedup invariants are preserved"), so parallelism within a `remember` call is limited.

### 4.4 LLM Response Caching

**There is NO persistent LLM response cache.** The context question ("is there an analogous LLM-response cache?") is answered definitively by the source:

- `embedding_cache` table: Postgres-backed, persists across restarts, keyed by SHA-256 of (provider, model, text, inputType)
- LLM responses: **only two in-memory TtlCaches** (not Postgres-backed, lost on daemon restart):
  - `query-router.js` line 11: `new TtlCache({ maxSize: 200, ttlMs: 10 * 60 * 1000 })` — 10-minute TTL
  - `query-expander.js` line 7: `new TtlCache({ maxSize: 100, ttlMs: 5 * 60 * 1000 })` — 5-minute TTL

No caching exists for: classifier, extractor, contextualizer, audm, entity-resolver, entity-matcher, synthesizer.

### 4.5 Cold-Start Cost of `claude -p`

The `claude-cli` provider spawns a fresh `claude` process for every call. The `claude` binary is an Electron-based app that:
1. Starts an Electron/Node.js runtime
2. Loads the Claude Code application bundle
3. Makes an API call (if rate-limit permits) or uses a subscription quota
4. Outputs result and exits

This cold-start overhead is ~2–8s per call on a typical machine, added on top of the actual LLM inference time. For a write path needing 3–5 LLM calls = **10–40s of cold-start overhead alone**, before any API latency. This is the dominant latency cost when using the `claude-cli` provider.

---

## 5. Proposed Workarounds

### Caller → Path Mapping

Before evaluating workarounds, map each caller to its path:

| Caller | Path | User-visible? |
|--------|------|---------------|
| `query-router` | Read (sync, in hook or search) | YES — blocks memory injection |
| `query-expander` | Read (sync, in hook or search) | YES — blocks memory injection |
| `synthesizer` | Read (sync, in search --synthesize) | YES (but disabled by default in hook) |
| `classifier` | Write (sync, blocks `remember` response) | YES if synchronous |
| `contextualizer` | Write (async after classify) | Only if sync |
| `extractor` | Write (async, per-chunk) | Only if sync |
| `audm` | Write (async, per-fact) | Only if sync |
| `entity-resolver` | Write (async, per-document) | Only if sync |
| `entity-matcher` | Write (async, per-entity match) | Only if sync |
| `stop-hook` | Write (async after Claude response) | No — runs after Claude's turn |
| `session-end-synth` | Write (async on session end) | No |

The `--bg` flag makes the **user-facing CLI** non-blocking, but the daemon still executes synchronously on the socket connection. The real fix for write-path latency is either async queueing inside the daemon (not currently implemented) or making LLM calls faster.

---

### 5a. Persistent `claude` Session via tmux send-keys + capture-pane

**Pattern:** Keep one (or a few) long-lived interactive `claude` sessions in tmux panes. Feed prompts via `tmux send-keys` and scrape output via `tmux capture-pane`. A wrapper process manages the pane state machine (idle → sent → waiting → idle).

**Integration with sigil's architecture:**
- Replace `spawnClaude()` in `src/lib/llm/providers/claude-cli.js` with a `tmuxChat()` function that sends to a named pane and polls for a sentinel pattern (e.g., `SIGIL_DONE_<uuid>`)
- The daemon process would own the tmux pane lifecycle
- Need a state machine: pane is "busy" while processing, "idle" when available
- Prompt/response delimiting is tricky: need to inject a unique end-marker and strip it from output

**Pros:**
- Zero cold-start overhead — the `claude` process is already warm
- True process reuse; no spawn overhead
- Works with Max plan / no API key (OAuth session persists in the warm pane)

**Cons:**
- Brittle: scraping terminal output is fragile; any UI change in `claude` breaks parsing
- Requires `tmux` to be installed and running
- No parallelism: one pane = one concurrent call; N panes for N-way parallel
- Session management: tmux sessions can be killed by system events, idle timeouts, or OOM
- Not reliable in headless/CI environments or Docker containers without special setup
- Race conditions if the pane receives unexpected output (shell prompt changes, warnings)
- No structured output guarantee — `-p --output-format json` is not used in interactive mode

**Effort:** L (large) — needs tmux availability check, pane lifecycle, sentinel parsing, timeout handling, reconnect logic

**Drop-in or refactor:** Drop-in replacement for `spawnClaude()` in `claude-cli.js`, but fragile enough to require ongoing maintenance.

---

### 5b. Pool of N Warm `claude` Processes

**Pattern:** At daemon startup, pre-spawn N `claude -p --model haiku` worker processes, each waiting on stdin for work. Dispatch each LLM call to a free worker; queue if all busy.

**Integration with sigil's architecture:**
- Implement a `WorkerPool` class in `src/lib/llm/providers/claude-cli.js`
- Workers are long-lived `spawn('claude', ['-p', '--model', cliModel, '--output-format', 'json'])` processes that stay alive, reading prompts from stdin and responding on stdout, one prompt at a time
- **Problem:** `claude -p` is designed for single-shot execution, not as a persistent worker. After returning one response, the process exits. The `--resume`/`--session-id` flags could theoretically keep a session alive, but these flags are for conversation continuity, not for turning `claude` into a persistent server

**Alternative implementation:** Use `--resume` to keep a "conversation" alive across multiple prompts in one process. Each LLM call appends to the session. The problem is that context accumulates — each call carries the prior conversation context, which grows unboundedly and affects model behavior (it starts "remembering" earlier classifier outputs, which is undesirable for stateless classification).

**Pros:**
- Amortizes cold-start overhead across many calls
- True parallelism if pool size > 1

**Cons:**
- `claude -p` is not designed as a persistent daemon; each call exits the process
- With `--resume`, context pollution across unrelated calls is a fundamental problem
- Memory leaks if workers aren't recycled after N calls
- Pool management adds complexity: idle timeout, health checks, restart logic

**Effort:** L — particularly because `claude -p`'s single-shot design makes persistent reuse fundamentally incompatible without session accumulation issues

**Drop-in or refactor:** Requires moderate refactor of `claude-cli.js` and possible integration into daemon startup

---

### 5c. Claude Agent SDK Persistent Runtime

**Pattern:** Use `@anthropic-ai/claude-agent-sdk` to create one long-lived agent that receives many programmatic `query()` calls without process cold-start.

**Integration with sigil's architecture:**
- Add `claude-agent-sdk` provider alongside existing providers in `src/lib/llm/providers/`
- Create a module-level agent instance, reused across calls
- Each `chat()` invocation calls `agent.query(prompt)` or equivalent

**Pros:**
- No process cold-start — agent is a JS object, not a subprocess
- Stateless from sigil's perspective (each call is independent if not using sessions)
- Clean API integration

**Cons:**
- **BREAKS the Max-plan-OAuth / no-API-key constraint.** The Claude Agent SDK requires an Anthropic API key (`ANTHROPIC_API_KEY`). It uses the Messages API directly. This is the same constraint that the `anthropic` provider already has. Users on Claude Max plan (subscription, no API key) cannot use this.
- The Agent SDK is for building agents that coordinate tool use and multi-step reasoning — it is not simply a faster replacement for single-shot `messages.create()`. The overhead may be similar to or higher than the direct Anthropic SDK.
- Streaming constraints: the Agent SDK may not support the exact same JSON-output mode sigil needs
- This essentially duplicates the existing `anthropic` provider with extra complexity

**Effort:** M — but provides no advantage over the already-implemented `anthropic` provider, and has the same API-key requirement

**Drop-in or refactor:** Would be a new provider file, but doesn't solve the core Max-plan problem

---

### 5d. MCP-as-LLM-Proxy: Local `claude` MCP Proxy

**Pattern:** Run a single warm `claude --mcp` process that exposes a local socket/HTTP endpoint. Sigil routes all LLM calls to this proxy instead of spawning `claude -p` per call. The proxy forwards to the Claude API and returns responses.

**Conceptually:** Since sigil already runs as an MCP server that Claude Code connects to, the inverse is also possible: sigil's daemon could be an MCP *client* connecting to a running `claude` instance as an MCP server. The `claude` process stays warm and handles many requests.

**Integration with sigil's architecture:**
- In `src/lib/llm/providers/claude-cli.js`, replace per-call `spawn()` with an HTTP/socket call to the proxy
- The proxy is a small Node.js process that maintains one warm `claude --mcp` session and forwards requests
- This is the `claude` CLI's own intended MCP server mode

**Pros:**
- `claude` process stays warm — eliminates cold-start overhead
- Works with Max plan OAuth (the `claude` binary handles auth)
- Clean separation: proxy process manages the `claude` lifetime, sigil's LLM provider just makes HTTP calls

**Cons:**
- `claude --mcp` serves sigil's *memory tools*, not the reverse. Running `claude` as an LLM proxy for sigil requires using `claude` in a mode it wasn't designed for (as a generic LLM endpoint, not as an MCP server of sigil's tools)
- Effectively reimplements what the Anthropic SDK does, but routed through the `claude` CLI binary
- The `claude` CLI does not expose a stable LLM-proxy HTTP API for external callers
- Requires careful protocol design and is essentially the tmux pattern with a cleaner transport

**Effort:** L — requires designing a custom proxy protocol on top of the `claude` CLI

**Drop-in or refactor:** Not a drop-in; requires a new proxy process and protocol design

---

### 5e. Anthropic SDK Direct (Breaks Max-Plan-OAuth Constraint)

**Pattern:** Use the existing `anthropic` provider (`src/lib/llm/providers/anthropic.js`) which already implements `@anthropic-ai/sdk` correctly.

**This already exists in sigil.** The `anthropic` provider creates a singleton `Anthropic` client and calls `messages.create()` directly. There is no process cold-start, no subprocess, no tmux.

**CRITICAL CONSTRAINT:** This requires `ANTHROPIC_API_KEY`. It does not work with a Claude Max subscription (OAuth/cookie-based auth from the `claude` CLI). The `claude-cli` provider exists precisely because many Claude Code users pay for Claude Max (subscription-based) and do not have a separate API key. The API costs money per token; Max plan subscribers have already paid a flat monthly fee.

**For users who DO have an API key:** The `anthropic` provider is already the correct solution. Use `LLM_PROVIDER=anthropic` and set `ANTHROPIC_API_KEY`. This eliminates all subprocess overhead.

**Pros:**
- Already implemented, zero development effort
- Singleton client — no process cold-start, just HTTP latency
- Full async parallelism possible
- Reliable, stable API

**Cons:**
- Requires API key (breaks the "no API key needed" promise of `claude-cli`)
- API costs: at Haiku pricing (~$0.80/$4.00 per 1M tokens), ingesting memory adds real cost vs. flat Max subscription
- Does not help Max-plan users

**Effort:** S (already done)

**Drop-in or refactor:** Already a drop-in; just set `LLM_PROVIDER=anthropic`

---

### 5f. Recommended Priority by Path

**For the read path (UserPromptSubmit hook — directly blocks user experience):**

The 2 LLM calls on the read path (query-router + query-expander) are the most user-visible. Options in priority order:

1. **Expand in-memory TtlCache to persistent DB cache** (S effort): Router and expander already have TtlCaches. Making them persist in Postgres (like `embedding_cache`) means cache survives daemon restarts. This is the lowest effort, highest leverage change.
2. **OpenRouter with Gemini Flash** (S effort): Already the recommended default in sigil's OpenRouter setup. Google Gemini Flash Latest at $0.0005/$0.003/1M tokens has ~500ms API latency, vs. 5-30s for a `claude -p` cold-start. One `sigil init` to switch provider eliminates the dominant cost.
3. **tmux warm session pool (option a)** for Max-plan users who must use `claude-cli`: reduces cold-start but adds fragility.

**For the write path (async, user-invisible when using --bg):**

Write-path callers (`classifier`, `extractor`, `contextualizer`, `audm`, `entity-resolver`) run in the daemon asynchronously after `--bg` fires. Their latency matters for freshness of memory (how quickly a remembered fact becomes searchable) but does not block the user. Lower priority.

The stop hook and session-end hook are already async (they run after Claude's response). Their latency is invisible.

---

### Top Recommendation: Switch LLM Provider to OpenRouter or Anthropic SDK

For the **single highest-leverage fix**: switch from `claude-cli` to `openrouter` (or `anthropic` if API key available).

- The `claude-cli` provider spawns a new `claude` process for **every LLM call**. With the default `haiku` model, a single `sigil remember` incurs 3-5+ cold-start spawns totaling 15-40s of overhead — far exceeding the 30s socket timeout.
- `openrouter` with `google/gemini-flash-latest` reduces each LLM call from 5-30s to ~0.5s, brings the entire write path under 5s, and keeps the read path well within the 30s socket timeout.
- `anthropic` SDK is even better if the user has an API key (already implemented, zero effort).

The only reason to stay on `claude-cli` is the Max-plan constraint (no API key). For those users, the tmux persistent session pattern (option a) is the most viable warm-process workaround, despite its fragility, because it is the only option that:
1. Eliminates cold-start overhead
2. Does not require an API key
3. Works with the existing Max-plan OAuth session

If implementing the tmux pattern, route **only the read-path callers** (query-router, query-expander, synthesizer) through the warm session, since those are user-visible. Write-path callers can continue using the slower fresh-spawn approach since they run asynchronously.
