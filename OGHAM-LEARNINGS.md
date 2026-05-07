# Ogham-MCP Architectural Lessons

Technical deep-dive on https://github.com/ogham-mcp/ogham-mcp — what they do well and what we should adopt.

---

## The Big Eight (prioritized quick wins)

1. **Split lifecycle state from the memory row** — dual table design (see §A). Highest structural impact. HNSW can't do HOT updates, so volatile state on the indexed row = catastrophic index bloat. Their migration 026 rolled this back. Do it *before* our fact table grows.

2. **Port their single-SQL hybrid search** — 97.2% R@10 on LongMemEval with one query (§B). Our current implementation does Node-side RRF merge; theirs is pure SQL. Faster, simpler, battle-tested.

3. **Adopt their secret-masking regex** verbatim in hooks (§C). 4-layer pipeline catching GitHub PATs, AWS keys, OpenAI/Anthropic tokens, URL credentials. ~130 lines of pure regex, zero LLM cost.

4. **Declarative client-detection table** for `cortex init` (§D). Their `_client_configs()` handles 9 harnesses (Claude Desktop, Claude Code, Cursor, VS Code Copilot, Codex, Kiro, Antigravity, OpenCode) in 70 lines. Pure data table, one dict entry per client.

5. **Two-tier noise filtering** for hook capture (§E). Noise tools (Read/Grep/Glob) always skipped; Bash gated by git-subcommand taxonomy (`commit`/`push`/`merge` = signal, `status`/`diff`/`log` = noise). Plus signal-keyword gate for routine commands.

6. **Dedup with low `ef_search`** (§F). `SET LOCAL hnsw.ef_search = 40` inside dedup queries — fast ANN for "does any match exist", reserves high recall for actual search.

7. **Fire-and-forget side-effects from search path** (§G). Don't `await` `recordAccess`, `openEditingWindow`, `strengthenEdges`. Search is a read path; side-effects go to a microtask queue. Trivial in Node.

8. **Skills as pure markdown** (§H). Three `SKILL.md` files chain tool calls with frontmatter `description` + body instructions. No runtime. Ship `cortex-recall/SKILL.md`, `cortex-ingest/SKILL.md`, `cortex-maintain/SKILL.md` alongside the npm package.

---

## §A. Lifecycle state split (highest impact)

**Problem:** Their migration 025 put `stage` + `stage_entered_at` on the `memories` table directly. Migration 026 tore it back out into a separate `memory_lifecycle` table. Why:

> "Updates to memories.stage / stage_entered_at break HOT updates and force tuple rewrites into the 512-dim HNSW index. At search volume this causes catastrophic index bloat and autovacuum pressure."

Any UPDATE to a row with an indexed column (even unchanged ones) creates a new tuple version in Postgres, and **HNSW can't do HOT updates**. Lifecycle transitions happening on every search-hit = index bloats fast.

**Their fix:** `memory_lifecycle` table 1:1 with `memories` via `memory_id uuid PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE`. Stage flips go into the skinny table; `memories` stays read-mostly. Two triggers keep them in sync.

**State machine:**
- `fresh` → `stable` via batch job after 1 hour + importance gate
- `stable` → `editing` on search hit (30-min window)
- `editing` → `stable` after 30 min

**For us:** Before our `fact` table grows, split access tracking into `fact_lifecycle` or `fact_access`. Columns like `access_count`, `last_accessed_at`, `stage` go there. `fact` keeps content + embedding only.

---

## §B. Single-SQL hybrid search RRF

Their full query (from `sql/schema_postgres.sql:381-479`):

```sql
WITH semantic AS (
  SELECT id,
         (1 - (embedding::halfvec(512) <=> query_embedding::halfvec(512))) AS similarity,
         row_number() OVER (ORDER BY embedding::halfvec(512) <=> query_embedding::halfvec(512)) AS rank_ix
  FROM memories
  WHERE ...
  ORDER BY embedding::halfvec(512) <=> query_embedding::halfvec(512)
  LIMIT match_count * 3          -- over-fetch 3x
),
keyword AS (
  SELECT id,
         ts_rank_cd(fts, websearch_to_tsquery(query_text), 34) AS keyword_rank,
         row_number() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery(query_text), 34) DESC) AS rank_ix
  FROM memories
  WHERE fts @@ websearch_to_tsquery(query_text) ...
  ORDER BY keyword_rank DESC
  LIMIT match_count * 3
),
fused AS (
  SELECT COALESCE(s.id, k.id) AS id,
         (semantic_weight * (1.0 / (rrf_k + COALESCE(s.rank_ix, match_count * 3)))
        + keyword_weight  * (1.0 / (rrf_k + COALESCE(k.rank_ix, match_count * 3)))) AS score
  FROM semantic s FULL OUTER JOIN keyword k ON s.id = k.id
)
SELECT m.*,
       (f.score
         * m.importance
         * (1.0 + ln(m.access_count + 1.0) * 0.1)
         * m.confidence
         * (1.0 + g.graph_boost * 0.2)
         * exp(-recency_decay * age_days)
       ) AS relevance
FROM fused f
JOIN memories m ON m.id = f.id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(r.strength), 0) AS graph_boost
  FROM memory_relationships r
  WHERE r.target_id = m.id OR r.source_id = m.id
) g ON true
ORDER BY relevance DESC LIMIT match_count;
```

**Key design decisions:**
- **Over-fetch 3×** from each retrieval stage — gives RRF enough candidates after intersection
- **FULL OUTER JOIN** on `s.id = k.id` — preserves items appearing in only one list
- **Pure position-based RRF** (`1 / (k + rank)`) — scale-invariant; doesn't need score normalization
- **Multi-layered multipliers at the end**: importance × access-boost × confidence × graph_boost × recency_decay

**Their migration 017 comment is a cautionary tale:** they had it as linear weighted sum of raw scores (`w1 * cosine + w2 * bm25`) for months. BM25 scores are unbounded but tiny, so the keyword component was effectively always zero. Fixing to real RRF jumped quality significantly.

PGlite has `websearch_to_tsquery`, `ts_rank_cd`, CTEs, window functions, FULL OUTER JOIN. Port verbatim.

---

## §C. Secret-masking regex (from `hooks.py:312-441`)

Four-layer pipeline, pure regex, zero LLM cost:

**Layer 1: KEY=value patterns** — service-specific prefixes (`sk-proj`, `ghp_`, `glpat-`, `xoxb-`, `whsec_`, `AKIA[A-Z0-9]{16}`, `eyJ[A-Za-z0-9_-]{20,}` for JWTs) + generic `api_key`, `secret_key`, `token`, `password`.

**Layer 2: Bare tokens** — standalone `ghp_[A-Za-z0-9]{36}`, `sk-ant-[A-Za-z0-9\-]{20,}`, `sk-[A-Za-z0-9]{40,}`, Discord bot `[A-Za-z0-9]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}`, Telegram `\d{8,12}:[A-Za-z0-9_-]{35}`.

**Layer 3: URL credentials** — `://([^:]+):([^@]{3,})@` → `://***MASKED***:***MASKED***@`.

**Layer 4: Env-var names** — loop over `{database_url, redis_url, mongodb_uri, dsn, private_key, encryption_key, ...}` and match any `KEY=value`.

Mask preserves key name so "event" is captured ("set API key for Stripe") but never the value. Port as `src/hooks/secret-mask.js` — Node's RegExp supports everything they use.

---

## §D. Declarative client detection

`_client_configs()` returns a list of 9 client descriptors. Each has: `path` / `format` / one of: `always_show`, `detect: Path`, `detect_cmd: str`.

| Client | Path | Format |
|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | `claude_desktop` |
| Claude Code (global) | `~/.claude/.mcp.json` | `mcp_json` |
| Cursor (global) | `~/.cursor/mcp.json` | `mcp_json` |
| VS Code Copilot | `.vscode/mcp.json` | `vscode` (uses `servers` not `mcpServers`) |
| Codex CLI | `~/.codex/config.toml` | `codex_toml` |
| Kiro | `~/.kiro/settings/mcp.json` | `mcp_json` |
| Antigravity (Google) | `~/.gemini/antigravity/mcp_config.json` | `antigravity` (`serverUrl`) |
| OpenCode | `~/.config/opencode/opencode.json` | `opencode` (top-level `mcp` key) |

Platform paths branch on `platform.system()`. `_write_mcp_config()` reads existing JSON, merges under right key, writes back. For Codex TOML, they explicitly *don't* parse TOML — regex-strip existing `[mcp_servers.ogham]` block and append fresh.

Docker mode does a neat substitution: `localhost` / `127.0.0.1` → `host.docker.internal` so containers reach host services.

---

## §E. Hook noise filtering

From `hooks.py:492-578`:

1. **Skip own tools** — `mcp__ogham__*`, `ogham_*`, `store_memory`, `hybrid_search` (prevent recursion)
2. **Always-skip tools** — `ToolSearch, Skill, Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, Agent, TaskCreate` (reconnaissance, not action)
3. **Bash**: parse command word
   - `_DEFAULT_NOISE_COMMANDS` = `{ls, pwd, cd, cat, head, tail, wc, echo, date, whoami, which, type, clear, history}` → skip
   - `git`/`gh` → inspect subcommand
     - Signal: `commit, push, merge, rebase, tag, release, reset, revert, cherry-pick`
     - Noise: `add, status, diff, log, show, branch, checkout, switch, fetch, pull, stash`
4. **Signal-keyword gate for routine Bash** — require at least one of `{error, fail, fix, decided, refactor, migrate, docker, deploy, railway, neon, supabase, pip install, npm install, ...}`
5. **Session-level dedup** — `_recent_actions: (session_id, tool_name, target_path) → timestamp`, 5-minute window, refresh on hit

Signal/noise lists loaded from `hooks_config.yaml` with hardcoded fallbacks. Users can tune.

Our current filter is a simple regex — we should go to the multi-stage version.

---

## §F. Dedup with low ef_search

Their `batch_check_duplicates` RPC does `PERFORM set_config('hnsw.ef_search', '40', true);` at the top. Dedup only needs "is there any match", not high recall — so faster ANN scan is fine.

Port: `SET LOCAL hnsw.ef_search = 40` in our AUDM similarity check. Should cut the dedup cost of bulk ingestion significantly.

---

## §G. Fire-and-forget side effects

Ogham spawns `ThreadPoolExecutor(max_workers=4)` for `advance_stages`, `open_editing_window`, `strengthen_edges`. In Node, just don't await:

```js
openEditingWindow(ids).catch(err => console.warn('lifecycle: open editing window failed', err));
strengthenEdges(ids).catch(err => console.warn('lifecycle: strengthen edges failed', err));
return results;
```

For heavier work, use `worker_threads`. For light DB writes, `setImmediate(() => ...)` is plenty.

---

## §H. Skills as pure markdown

Three `SKILL.md` files in `skills/` directory, each with frontmatter:

```yaml
---
name: ogham-recall
description: |
  Smart retrieval from Ogham shared memory. Use when the user wants to recall
  what they know, ... Triggers on "what do I know about", "find related", ...
---
```

The body is step-by-step instructions to the LLM. Example `ogham-recall`:
1. Start with `hybrid_search` using user's query
2. If connections needed, set `graph_depth=1` to follow edges
3. Pick top IDs, run `find_related` to walk outward
4. Check for decisions with `tags=["type:decision"]`
5. Present results scannable, one-line summary + relative time

**No code. Zero.** The harness auto-discovers `~/.claude/skills/` and the LLM triggers based on frontmatter `description`.

We can ship `skills/` directory with three markdown files and get workflow guidance for free.

---

## Other notable patterns

### Halfvec compression (migration 013)

Column stays `vector(512)` (float32). HNSW index casts to `halfvec(512)` (float16):

```sql
CREATE INDEX memories_embedding_idx ON memories
USING hnsw ((embedding::halfvec(512)) halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

~50% index size reduction with negligible quality loss. PGlite pgvector supports halfvec.

### ACT-R importance scoring (§match_memories)

```sql
(1 - (m.embedding <=> query)) *
ln(1.0 + exp(
  ln(access_count + 1.0) - 0.5 * ln(
    greatest(extract(epoch from now() - coalesce(last_accessed_at, created_at)) / 86400.0, 0.01)
    / (access_count + 1.0)
  )
)) * confidence * (1.0 + graph_boost * 0.2)
```

ACT-R base activation `B(M) = ln(n+1) - 0.5 * ln(t)` — from Anderson's cognitive architecture. Softplus (`ln(1+exp(x))`) keeps it non-negative.

### Hebbian decay (batch, not on-read)

```sql
UPDATE memories
SET importance = greatest(0.05,
    importance * power(
        CASE WHEN access_count >= 10 THEN 0.99 ELSE 0.95 END,
        extract(epoch from (now() - coalesce(last_accessed_at, created_at))) / 2592000.0
    )
)
WHERE last_accessed_at < now() - interval '7 days';
```

Frequent memories (access_count ≥ 10) decay ~5× slower — long-term potentiation. Floor at 0.05. **Run as batch job, not on-access.**

### Lexicographic canonicalization for undirected edges

When inserting Hebbian co-retrieval edges, always `tuple(sorted(pair))` before insert. Prevents deadlocks and duplicate `(a,b)` vs `(b,a)` rows. Important lesson for our relation table.

### Read-time fact extraction (opposite of our approach)

Their `hybrid_search(extract_facts=True)` triggers an LLM pass *after* retrieval:
- Concatenate top results
- Prompt: "Extract facts most relevant to the question"
- Return synthetic result `{id: "extracted-facts", content: <LLM output>}`

Ogham does NOT extract at write time. Raw memories go in; facts come out at read time.

**Tradeoff:**
- Write-time (ours): higher write cost, richer fact table, cheaper reads, harder to re-extract
- Read-time (theirs): cheap writes, per-query LLM cost (opt-in), easy to re-extract

We could add `search_with_synthesis` as opt-in. Claude Haiku is cheap enough.

### Embedding cache

SQLite-backed `~/.cache/ogham/embeddings.db`. Key = sha256(text), value = JSON embedding. LRU eviction by `created_at ASC` when size > 10k. Supports dense + sparse.

For us: tiny `src/ingestion/embedding-cache.js` with `better-sqlite3`, or just an `embedding_cache` table in PGlite.

### Benchmark methodology

`benchmarks/longmemeval_benchmark.py`:
- Download from HuggingFace (`xiaowu0162/longmemeval-cleaned`, 500 questions)
- Ingest each question's context with one profile per question (isolation)
- Run retrieval, compute Recall@K / NDCG@K / MRR
- Retrieval-only is free; full QA adds ~$4 in LLM calls
- Exponential backoff retry wrapper
- Cleanup mode deletes benchmark profiles

**Port this to Node.** Most is data-shuffling + MCP calls. Key trick: one profile per question = clean per-question metrics.

---

## File-to-file mapping

| Ogham file | Purpose | Our equivalent |
|------------|---------|----------------|
| `src/ogham/server.py` | MCP transport switch | `src/server.js` |
| `src/ogham/hooks.py` (642 lines) | Hook filters + secret mask | `src/hooks/*.js` + new `secret-mask.js` |
| `src/ogham/init_wizard.py` (810 lines) | Client detection + install | `runInit()` in `src/cli.js` |
| `src/ogham/lifecycle.py` + `lifecycle_executor.py` | Lifecycle state machine | (new) `src/memory/lifecycle/` |
| `sql/schema_postgres.sql` (1014 lines) | Full schema + RPCs | Our `src/db/migrations/*` |
| `sql/migrations/017_rrf_bm25.sql` | RRF SQL (corrected) | `src/memory/search/hybrid.js` → SQL function |
| `sql/migrations/025` + `026_memory_lifecycle_split.sql` | Lifecycle table split | (new) migration |
| `sql/migrations/013_halfvec_compression.sql` | Halfvec index | (new) migration |
| `skills/ogham-{research,recall,maintain}/SKILL.md` | Skill markdown | (new) `skills/cortex-*.md` |
| `benchmarks/longmemeval_benchmark.py` | Benchmark harness | Extend our `src/scripts/benchmark.js` |

---

## Recommended implementation order

1. Lifecycle state split (§A) — highest impact, do before fact table grows
2. Port hybrid-search SQL (§B) — single biggest quality improvement
3. LongMemEval benchmark harness — we need published numbers to compete
4. Secret-mask port (§C) — small, high-value
5. Two-tier hook filtering (§E) — small, improves our capture quality
6. Declarative client detection (§D) — unlocks Cursor/Windsurf/etc. distribution
7. Halfvec index — free 50% index size reduction
8. Ship SKILL.md files (§H) — zero-code, zero-runtime
9. Fire-and-forget side effects (§G) — tidy up search path
10. Embedding cache — nice-to-have, 2-3× faster re-ingestion
