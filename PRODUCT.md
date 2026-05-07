# Cortex — Product Document

> Persistent memory for AI coding assistants. Local-first, zero-cloud, structured knowledge with entity graphs.

---

## What Is Cortex

Cortex is a **personal knowledge engine** that gives AI coding assistants (Claude Code, Cursor, Windsurf) persistent, structured memory across sessions.

Every time you close a Claude Code session, your AI starts from zero. It forgets your architecture decisions, your coding preferences, the bugs you fixed yesterday, and the research you did last week. Cortex fixes this.

It ingests your documents, code, URLs, and quick notes. It extracts atomic facts, builds an entity graph with relationships, and makes everything searchable through hybrid semantic + keyword search. All running locally on your machine — no cloud, no Docker, no subscriptions.

### What Makes Cortex Different

| Capability | Cortex | claude-mem | Mem0 | Obsidian |
|-----------|--------|------------|------|----------|
| Atomic fact extraction | Yes (LLM-powered) | No (session logs) | Basic | No (manual) |
| Entity graph + relationships | Yes (3-stage dedup) | No | Paid only | Manual links |
| Hybrid search (vector + keyword + graph) | Yes | No | Vector only | Plugin |
| AUDM deduplication | Yes | No | Basic | No |
| Fully local (embedded DB) | Yes (PGlite) | Yes (SQLite) | Cloud-first | Yes |
| MCP-native | Yes | Yes | No | Plugin |
| Document/code/URL ingestion | Yes | No | No | No |
| Zero API key mode | Yes (claude-cli provider) | Yes | No | N/A |

---

## How It Works — End to End

### Step 1: Installation

```bash
npm install -g @anmol-srv/cortex
```

This installs the `cortex` CLI globally. No Docker, no database server, no background daemon. Cortex uses **PGlite** — an embedded PostgreSQL compiled to WebAssembly — so the database runs inside the Node.js process itself.

**Requirements:**
- Node.js 18+
- Ollama (for embeddings) — free, runs locally
- One of: Claude Code subscription (free), OpenAI API key, Anthropic API key, or Ollama LLM

### Step 2: Setup — `cortex init`

```bash
cortex init
```

An interactive setup wizard that configures everything in under 2 minutes:

```
◆ Cortex — persistent memory for Claude

◆ LLM provider (for fact extraction and reasoning)
│ ● Claude Code — uses your existing subscription, no extra API key
│ ○ OpenAI — gpt-4o-mini
│ ○ Anthropic — Claude Haiku, requires API key
│ ○ Ollama — local models, no API cost

◆ Embedding provider (for semantic search)
│ ● Ollama — nomic-embed-text, free, runs locally
│ ○ OpenAI — text-embedding-3-small, requires API key

◆ Pull nomic-embed-text embedding model now? (~270MB)
│ Yes

◆ Default namespace
│ default

◇ Initialising memory database...
◇ Memory database ready (8 tables created)
◇ Claude memory configured

┌ Setup complete
│
│ Memory store  ~/.cortex/db  (embedded, no server needed)
│ Config        ~/.cortex/.env
│ Claude        ~/.claude/CLAUDE.md — Cortex is now your memory
│
│ Quick start:
│   cortex remember "your first fact"
│   cortex ingest <file-or-url>
│   cortex search "anything"
└
```

**What happens behind the scenes:**

1. **Provider configuration** — Writes `~/.cortex/.env` with your LLM provider, API keys (if any), embedding provider, and namespace. The `claude-cli` provider piggybacks on your existing Claude Code subscription — zero additional cost.

2. **Embedding model** — If you chose Ollama, pulls `nomic-embed-text` (768-dimensional embeddings, ~270MB). This model runs locally and is free forever.

3. **Database creation** — Creates `~/.cortex/db/` with an embedded PGlite database. Runs 8 migrations that create: `document`, `chunk`, `fact`, `entity`, `relation`, `fact_entity`, `history`, and `llm_log` tables — all with pgvector extensions for vector similarity search.

4. **Claude Code integration** — Writes `~/.cortex/CLAUDE.md` with instructions for Claude to use Cortex as its memory system, and adds an `@import` line to `~/.claude/CLAUDE.md` so Claude reads it at every session start. Also generates a **hot-context snapshot** — the top 20 most important facts that Claude sees immediately.

### Step 3: Ingesting Knowledge

Cortex can ingest content from three sources:

#### Files and Globs

```bash
cortex ingest ./README.md
cortex ingest "docs/**/*.md"
cortex ingest src/auth.js src/config.js
```

#### URLs

```bash
cortex ingest https://example.com/api-docs
```

#### Quick Facts (Remember)

```bash
cortex remember "We use PostgreSQL 16 in production"
cortex remember "Anmol prefers tabs over spaces" "Deploy target is AWS ECS"
cortex remember --bg "fact1" "fact2"   # background mode, returns immediately
```

#### What Happens During Ingestion

Every piece of content goes through a **6-stage pipeline**:

```
Content In
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 0: CLASSIFY (Cognitive Router)                    │
│                                                         │
│ LLM classifies the input into one of three routes:      │
│   thought  → short personal fact, skip chunking         │
│   knowledge → document, run full pipeline               │
│   noise    → irrelevant, skip entirely                  │
│                                                         │
│ "I prefer React" → thought (stores directly as fact)    │
│ README.md → knowledge (full pipeline)                   │
│ "hi" → noise (discarded)                                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 1: PARSE                                          │
│                                                         │
│ Format-specific parsers extract text + sections:         │
│   markdown.js  → splits by headings                     │
│   code.js      → splits by functions/classes            │
│   html.js      → strips tags, extracts text             │
│   json-parser.js → converts to readable text            │
│   text.js      → splits by paragraphs                   │
│                                                         │
│ Auto-detected from file extension or content type.       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 2: DEDUP CHECK                                    │
│                                                         │
│ SHA-256 hash of the content is compared against the     │
│ document table. If the hash matches an existing          │
│ document, ingestion is skipped (content unchanged).      │
│                                                         │
│ This makes re-ingestion safe and fast — run              │
│ `cortex ingest "docs/**/*.md"` as often as you want.    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 3: CHUNK + CONTEXTUALIZE + EMBED                  │
│                                                         │
│ Sections are split into chunks (~500 tokens each).       │
│ Each chunk gets a contextual prefix from the LLM:       │
│   "This chunk describes the authentication middleware    │
│    in the Express.js application."                      │
│                                                         │
│ Each chunk is then embedded via Ollama (nomic-embed-text)│
│ into a 768-dimensional vector and stored in the chunk    │
│ table with its pgvector embedding.                       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 4: EXTRACT FACTS                                  │
│                                                         │
│ Each chunk is sent to the LLM with an extraction prompt. │
│ The LLM returns atomic facts:                           │
│                                                         │
│   Input chunk: "We migrated from MySQL to PostgreSQL    │
│   in Q3 2024 because of JSON support..."                │
│                                                         │
│   Extracted facts:                                      │
│   - "Database was migrated from MySQL to PostgreSQL"    │
│     [category: architecture, confidence: high,          │
│      importance: vital]                                  │
│   - "Migration happened in Q3 2024"                     │
│     [category: timeline, confidence: high,              │
│      importance: supplementary]                          │
│   - "PostgreSQL was chosen for JSON support"            │
│     [category: decision, confidence: high,              │
│      importance: vital]                                  │
│                                                         │
│ Each fact is then run through the AUDM pipeline.         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 4b: AUDM DEDUPLICATION                            │
│                                                         │
│ For each extracted fact, Cortex checks similarity        │
│ against ALL existing facts using pgvector cosine search: │
│                                                         │
│ similarity >= 0.88 → SKIP (paraphrase of existing fact) │
│ similarity >= 0.65 → ASK LLM to decide:                │
│   ADD       — new information, store alongside          │
│   UPDATE    — newer version of same fact, supersede     │
│   DELETE    — contradicts existing fact, mark old invalid│
│   MERGE     — combine both into a richer fact           │
│ similarity < 0.65  → ADD (clearly new fact)             │
│                                                         │
│ This prevents knowledge corruption from duplicate        │
│ ingestion while preserving genuine updates.              │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Stage 5: LINK ENTITIES                                  │
│                                                         │
│ Topic entities are extracted from the facts via LLM.     │
│ Each entity goes through a 3-stage resolution cascade:   │
│                                                         │
│   Stage 1: Exact name match (DB lookup)                 │
│   Stage 2: Embedding similarity + LLM verify            │
│            (catches "React" = "React.js" = "ReactJS")   │
│   Stage 3: Create new entity                            │
│                                                         │
│ Entities are linked to facts via the fact_entity table.  │
│ Relations between entities are tracked with temporal     │
│ metadata (valid_from, valid_until, mention_count).       │
│                                                         │
│ Result: a growing knowledge graph where entities like    │
│ "PostgreSQL", "authentication", "Anmol" accumulate       │
│ facts and relationships over time.                       │
└─────────────────────────────────────────────────────────┘
```

#### Example Output

```bash
$ cortex ingest ./docs/architecture.md

[0/6] Classifying input...
  Route: knowledge — technical documentation
[1/6] Parsing content...
[2/6] Checking for changes...
[3/6] Chunking and embedding...
  4 chunks created
[4/6] Extracting facts...
  7 facts extracted from 4 chunks
[5/6] Linking entities...
  3 entities, 2 relations
Done. 4 chunks, 7 facts, 3 entities
```

### Step 4: Searching Knowledge

#### CLI Search

```bash
cortex search "what database do we use"
```

```
Facts (3):
  Database was migrated from MySQL to PostgreSQL [0.82]
  PostgreSQL was chosen for JSON support [0.76]
  Production database runs on PostgreSQL 16 [0.71]
```

#### How Search Works

Cortex uses a **3-layer hybrid search** with cognitive routing:

```
User Query: "what database do we use"
         │
         ▼
┌──────────────────────────────────────────┐
│ COGNITIVE ROUTER                         │
│                                          │
│ LLM classifies query intent:             │
│   preference → filter personal categories│
│   factual → standard search              │
│   entity_lookup → enable graph traversal │
│   exploratory → expand query + graph     │
│   temporal → add time filter             │
│                                          │
│ "what database" → factual                │
└──────────────┬───────────────────────────┘
               │
         ┌─────┴─────┐
         ▼           ▼
┌────────────┐ ┌────────────┐
│  VECTOR    │ │  KEYWORD   │
│  SEARCH    │ │  SEARCH    │
│            │ │            │
│ Embed query│ │ tsvector + │
│ → pgvector │ │ ts_rank    │
│ cosine sim │ │ full-text  │
└─────┬──────┘ └──────┬─────┘
      │               │
      └───────┬───────┘
              ▼
┌──────────────────────────────────────────┐
│ RECIPROCAL RANK FUSION (RRF)            │
│                                          │
│ Merges results from both search methods: │
│   score = Σ (weight / (K + rank))        │
│                                          │
│ Vector weight: 1.0 (semantic relevance)  │
│ Keyword weight: 0.7 (exact term matches) │
│ K = 20 (score spread parameter)          │
│                                          │
│ Facts appearing in BOTH lists rank       │
│ higher than facts in only one.           │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│ ENTITY DETECTION (optional)             │
│                                          │
│ If query matches a known entity name,    │
│ switches to entity-first search:         │
│   1. Find the entity by name             │
│   2. Get all facts linked to that entity │
│   3. Get related entities + their facts  │
│                                          │
│ "PostgreSQL" → entity match → returns    │
│ all facts about PostgreSQL + related     │
│ entities (MySQL, database, migration)    │
└──────────────────────────────────────────┘
```

#### Query Expansion

For exploratory queries, Cortex can expand the query into semantic variants:

```
"what tech stack should I use?"
  → "technology preferences"
  → "preferred programming languages"
  → "frameworks to avoid"
  → "recommended tools and libraries"
```

Each variant is searched independently, and results are merged. This surfaces facts that don't literally match the query but are semantically related.

### Step 5: Claude Code Integration

Cortex integrates with Claude Code in two ways:

#### 1. Hot Context (Automatic)

At `cortex init` (and after every `cortex remember` / `cortex ingest`), Cortex writes a **hot-context snapshot** to `~/.cortex/CLAUDE.md`. This contains the top 20 most relevant facts, scored by:

- **Importance** — facts marked "vital" rank higher
- **Access frequency** — facts Claude searches for often rank higher
- **Recency** — recently created or accessed facts rank higher

Claude reads this at every session start via `@import` in `~/.claude/CLAUDE.md`. No search needed — the most important facts are already in context.

#### 2. MCP Tools (On-Demand)

Cortex registers as an MCP server, giving Claude 7 tools for deep knowledge access:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `search` | Hybrid search across all facts | "What do we know about X?" |
| `search_entity` | Find entities by name or type | "Find all people/topics/documents" |
| `traverse_graph` | Navigate entity relationships | "What's related to X?" |
| `get_fact_context` | Full detail on a specific fact | Drill down on a search result |
| `get_entity_context` | Full detail on an entity | All facts + relations for an entity |
| `status` | Knowledge base statistics | "How much does Cortex know?" |
| `ingest` | Ingest content via MCP | "Remember this document" |

To register Cortex as an MCP server:

```bash
cortex register
```

This adds Cortex to your Claude Code MCP configuration so Claude can call these tools directly.

#### 3. CLI Commands (Direct)

Claude can also use Cortex via shell commands in `~/.cortex/CLAUDE.md` instructions:

```bash
! cortex search "relevant query"        # search before answering
! cortex remember --bg "fact1" "fact2"   # save facts in background
```

### Step 6: Knowledge Accumulation

Cortex is designed for **continuous knowledge accumulation**. The more you use it, the smarter it gets:

```
Week 1:  cortex ingest README.md
         → 5 facts about the project

Week 2:  cortex remember "Switched auth from JWT to sessions"
         → AUDM detects this updates the old "uses JWT" fact
         → Old fact marked invalid, new fact stored

Week 3:  cortex ingest "docs/**/*.md"
         → 30 new facts, 5 skipped (already known), 2 updated
         → Entity graph now connects: auth → sessions → PostgreSQL

Week 4:  Claude asks "how does auth work?"
         → Search returns the latest facts
         → Entity graph shows: auth → sessions → Redis (cache) → PostgreSQL (store)
         → Claude gives an accurate, current answer
```

Facts don't pile up endlessly. AUDM ensures:
- Duplicate facts are skipped
- Updated facts supersede old versions
- Contradictory facts are flagged
- The knowledge base stays clean and current

---

## Architecture At a Glance

```
┌─────────────────────────────────────────────────────────┐
│                      CORTEX                             │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │   CLI        │  │   MCP       │  │  CLAUDE.md     │  │
│  │   cortex *   │  │   7 tools   │  │  @import       │  │
│  │              │  │   stdio     │  │  hot-context    │  │
│  └──────┬───────┘  └──────┬──────┘  └───────┬────────┘  │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴────────┐ │
│  │              Domain Layer                           │ │
│  │                                                     │ │
│  │  ingestion/          memory/                        │ │
│  │    pipeline.js         facts/store.js (AUDM)       │ │
│  │    parsers/*            entities/resolver.js        │ │
│  │    chunker.js           search/hybrid.js (RRF)     │ │
│  │    embedder.js          cognitive/query-router.js   │ │
│  │    contextualizer.js    cognitive/input-classifier  │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                               │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │              Infrastructure                         │ │
│  │                                                     │ │
│  │  PGlite + pgvector        LLM Providers             │ │
│  │  (embedded PostgreSQL)    (claude-cli / openai /     │ │
│  │  ~/.cortex/db/             anthropic / ollama)       │ │
│  │                           Auto-detected              │ │
│  │  Ollama Embeddings                                   │ │
│  │  (nomic-embed-text)                                  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Model

```
document  1 ──→ N  chunk     (raw text segments with embeddings)
document  1 ──→ N  fact      (atomic knowledge with embeddings)
fact      N ←──→ N  entity   (via fact_entity junction)
entity    N ──→ N  entity    (via relation table)
fact      1 ──→ N  history   (AUDM audit trail)
```

### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `document` | Source registry | source_path, content_hash, namespace |
| `chunk` | Raw text segments | content, embedding (vector), section_heading |
| `fact` | Atomic knowledge | content, category, confidence, importance, embedding, status, valid_from, valid_until |
| `entity` | People, topics, documents | name, entity_type, embedding, mention_count |
| `relation` | Entity relationships | source_id, target_id, relation_type, mention_count |
| `fact_entity` | Fact-entity links | fact_id, entity_id |
| `history` | AUDM audit trail | fact_id, action, old_content, new_content |
| `llm_log` | LLM call tracking | provider, model, caller, tokens, cost, duration |

---

## LLM Provider System

Cortex supports 4 LLM providers with automatic detection:

| Provider | API Key Needed | Cost | Best For |
|----------|---------------|------|----------|
| `claude-cli` | No (uses Claude Code subscription) | Free with subscription | Default — zero friction |
| `openai` | Yes (`OPENAI_API_KEY`) | ~$0.15/M input tokens (gpt-4o-mini) | Cheapest API option |
| `anthropic` | Yes (`ANTHROPIC_API_KEY`) | ~$0.80/M input tokens (Haiku) | Direct Anthropic access |
| `ollama` | No (local) | Free | Fully offline |

**Auto-detection waterfall** (when no provider is configured):
1. `ANTHROPIC_API_KEY` set → use Anthropic
2. `OPENAI_API_KEY` set → use OpenAI
3. Ollama reachable → use Ollama
4. `claude` CLI in PATH → use Claude CLI

**Per-task provider overrides:**
```bash
LLM_EXTRACTION_MODEL=claude-cli:haiku     # cheap extraction
LLM_DECISION_MODEL=anthropic:claude-sonnet-4-6  # accurate AUDM decisions
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `cortex init` | Interactive setup — provider, keys, DB, Claude integration |
| `cortex remember "text"` | Save one or more facts to memory |
| `cortex remember --bg "text"` | Save facts in background (returns immediately) |
| `cortex ingest <file\|url\|glob>` | Ingest documents into the knowledge base |
| `cortex search "query"` | Search the knowledge base |
| `cortex context` | Refresh the hot-context snapshot |
| `cortex status` | Show knowledge base statistics |
| `cortex migrate` | Run database migrations |
| `cortex reset --confirm` | Reset the database (drops all data) |
| `cortex register` | Register as a Claude Code MCP server |

---

## File Layout

```
~/.cortex/
├── .env              # Provider config, API keys, namespace
├── db/               # PGlite embedded database (auto-created)
└── CLAUDE.md         # Instructions + hot-context for Claude

~/.claude/
└── CLAUDE.md         # Contains @import to ~/.cortex/CLAUDE.md
```

Everything lives in `~/.cortex/`. No files in your project directory. No cloud. No external services (except Ollama for embeddings and optional LLM API).

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Install to first fact | < 2 minutes |
| Embedding dimensions | 768 (nomic-embed-text) |
| Fact dedup threshold | 0.88 cosine similarity |
| AUDM ambiguous threshold | 0.65 cosine similarity |
| Hot-context facts | Top 20, scored by importance + access + recency |
| RRF K parameter | 20 (optimized for small result sets) |
| Vector search weight | 1.0 |
| Keyword search weight | 0.7 |
| Chunk size | ~500 tokens |
| LLM calls per ingestion | ~1 per chunk (extraction) + 1 per fact (AUDM if ambiguous) + 1 (entity extraction) |
