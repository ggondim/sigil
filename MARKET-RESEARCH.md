# Cortex — Market Research Report

**Date:** April 12, 2026
**Scope:** Market landscape, competitors, target users, pricing, gaps & opportunities

---

## Executive Summary

Cortex sits at the intersection of five converging markets — AI memory, personal knowledge management, RAG infrastructure, developer tools, and the MCP ecosystem — representing a composite **$11-12B TAM in 2025, growing to $60-70B by 2030**. The timing is exceptional: MCP has 97M+ monthly SDK downloads, Ollama hit 52M downloads/month, the a16z "context layer" thesis validates Cortex's architecture, and competitors are either cloud-locked or architecturally shallow.

**Cortex is the only tool that combines:** fully local operation (PGlite + pgvector, no Docker), three-layer knowledge (chunks + atomic facts + entity graph), hybrid search (vector + keyword + graph enhancement), AUDM deduplication, MCP-native integration, and CLI-first developer experience — in a single `npm install`.

The primary target is **developers using AI coding assistants** (Claude Code, Cursor, Cline) frustrated by context loss between sessions. The go-to-market is **HackerNews + r/LocalLLaMA + Claude Code community**, following the Obsidian playbook (small team, open-core, developer-beloved, privacy-first).

---

## 1. Market Landscape & Sizing

### Market Size Estimates

| Market | 2025 Size | 2030 Projection | CAGR |
|--------|-----------|-----------------|------|
| Knowledge Management Software | $22-23B | $40-55B | ~15-17% |
| AI-Driven Knowledge Management | $7.7B | $51.4B | ~46% |
| RAG Tools | $1.9-2.3B | $9.9B | ~38% |
| AI Code / Developer Tools | $7.4-7.9B | $24-91B (by 2035) | ~24-28% |
| Vector Databases | $2.6B | $8.9B | ~27% |
| Personal Knowledge Base AI | $1.65B (2025) | $6.15B (2030) | ~30% |

### TAM / SAM / SOM

- **TAM (AI Knowledge + RAG + AI Memory):** ~$11-12B in 2025 → $60-70B by 2030
- **SAM (Developer-specific, local-first PKM):** ~$330-410M in 2025 → $1.2-1.5B by 2030 (developers = ~20-25% of PKM users)
- **SOM (Year 1-2):** $5-15M (thousands of paying power users at $10-25/month). Could scale to $50-100M with enterprise offering, modeling Obsidian's trajectory ($25M ARR, 1.5M MAU, 7-person team, $350M valuation)

### Key Market Trends

1. **The "Context Layer" thesis is mainstream.** a16z (March 2026) explicitly argues a context layer — canonical entities, identity resolution, tribal knowledge, governance — is the missing infrastructure for AI agents. This is precisely what Cortex builds.

2. **MCP is the universal standard.** 97M+ monthly SDK downloads. 10,000+ public servers. Backed by Anthropic, OpenAI, Google, Microsoft. Donated to the Agentic AI Foundation (Dec 2025). Projected $10.3B ecosystem.

3. **Local-first AI is structural, not niche.** EU AI Act enforcement + US state privacy laws as tailwinds. 78% of users refuse cloud AI features; 91% would pay more for on-device processing. Ollama grew 520x in 3 years (100K → 52M downloads/month).

4. **Developer AI tool adoption is near-universal.** 28.7M developers worldwide. 85% regularly use AI tools. 51% daily. 46% of newly written code is AI-assisted (projected 60% by end of 2026).

5. **The "Second Brain" is being rebuilt for AI.** Gartner: by 2026, personalized AI learning companions replace 30%+ of traditional note-taking apps. The shift is from tools humans browse to tools AI agents query.

---

## 2. Competitive Landscape

### Category 1: AI Memory / Context Layers (Direct Competitors)

| Competitor | What It Does | Pricing | Open Source | Differentiator | Weakness vs. Cortex |
|-----------|-------------|---------|-------------|----------------|---------------------|
| **Mem0** ($24M Series A) | AI memory layer for apps. Extracts memories from conversations. 41K GitHub stars, 186M API calls/quarter | Free: 10K adds/mo. Starter $19/mo. Pro $249/mo. Enterprise custom | Core: Apache 2.0. Platform: proprietary | Drop-in SDK, managed cloud, graph memory (paid) | No entity graph (free tier), no document/code/URL ingestion, cloud-first, no MCP, no AUDM dedup, no hybrid search |
| **Zep** | Long-term memory for AI assistants. Extracts facts from conversations, user-level memory | Free: 1K credits/mo. Flex ~$25/mo. Enterprise custom | Community: MIT. Cloud: proprietary | Temporal/episodic memory, dialog classification | Chat-focused (no doc ingestion), heavy infra, cloud push, 600K+ token memory footprint, hours for graph construction |
| **Letta** (formerly MemGPT) | Self-editing memory for LLMs. Virtual memory hierarchy the LLM manages autonomously | Free (open-source). Cloud in development | Apache 2.0 | LLM manages its own memory via function calls | Agent-centric not knowledge-centric, no ingestion pipeline, no entity graph, no hybrid search, Python-only, locks you into Letta runtime |
| **Supermemory** | Browser-extension focused AI memory | Free (early stage, open-source) | Yes | Browser context capture | No structured knowledge, no entity graph, no developer workflow integration |
| **OpenMemory** (CaviraOSS) | Local persistent memory with temporal graphs + MCP | Free (open-source) | Yes | Local-first + MCP | Simpler architecture, no AUDM, no 4-stage entity resolution, no hybrid search |

### Category 2: Personal Knowledge Management with AI

| Competitor | Pricing | Open Source | Cortex Advantage |
|-----------|---------|-------------|------------------|
| **Obsidian** (1.5M MAU, $25M ARR) | Free core. Sync $4/mo. Publish $8/mo | No (source-available) | Cortex auto-extracts facts & entities; Obsidian requires manual organization. No MCP, no programmatic API for AI assistants |
| **Notion AI** (100M users, $400M ARR) | Plus $10/user/mo + AI $10/user/mo | No | Cloud-only, expensive, no code ingestion, no entity graph, no MCP, closed ecosystem |
| **Mem.ai** | Free (25 notes/mo). Pro $12/mo | No | Cloud-only, no developer focus, no entity graph, no MCP |
| **Reflect** | $10/mo (single tier) | No | Cloud-dependent for AI, no developer features, no MCP |
| **Tana** | Free core. Pro $9.99/mo (beta) | No | Still beta, cloud-only, no developer features, no MCP |
| **AnyType** | Free (P2P, local-first) | Source-available | No AI features, no fact extraction, no semantic search, no LLM integration |

### Category 3: RAG / Knowledge Base Infrastructure

| Competitor | Pricing | Cortex Advantage |
|-----------|---------|------------------|
| **LlamaIndex** | Free (OSS). LlamaCloud $35+/mo | Framework requiring assembly, not a product. No CLI for personal use, no MCP, no built-in AUDM |
| **LangChain** | Free (OSS). LangSmith $39/seat/mo | Framework, not standalone. Over-engineered. No entity graph, no CLI, no MCP |
| **Pinecone** | Free tier. Standard $50/mo+ | Cloud-only, just a vector store. No fact extraction, no entity graph. Vendor lock-in |
| **Weaviate** | Free (self-host). Cloud $45/mo+ | Database, not knowledge engine. No fact extraction, no document pipeline, no MCP |
| **ChromaDB** | Free (OSS). Cloud pay-as-you-go | Just an embedding store. No entity graph, no hybrid search, no ingestion pipeline |
| **Qdrant** | Free (OSS). Cloud $25/mo+ | Same as other vector DBs — infrastructure, not product |

### Category 4: Developer-Facing Knowledge Tools

| Competitor | Cortex Advantage |
|-----------|------------------|
| **Pieces for Developers** | Proprietary core. Code snippets focused, not general knowledge. No custom ingestion, no entity graph |
| **Cursor context features** | Locked to Cursor editor. Ephemeral per-conversation context. No persistent memory, no MCP server |
| **Windsurf/Codeium context** | Same as Cursor — editor-locked, no persistent cross-project knowledge |

### Category 5: MCP-Native Memory Tools

| Competitor | Cortex Advantage |
|-----------|------------------|
| **@modelcontextprotocol/server-memory** | Flat JSON file. No vector search, no fact extraction, no entity graph. Toy implementation |
| **mcp-server-qdrant, mcp-server-ragdocs** | Thin wrappers around single vector DB. No entity graph, no hybrid search, no dedup |
| **claude-mem** (46.1K stars) | Session capture → compress → reinject. No atomic facts, no entity graph, no structured knowledge |
| **MemPalace** (30K+ stars) | Overstated claims, MCP stdout bugs, "halls" metadata not used in retrieval. Credibility crisis |

### Competitive Positioning Matrix

```
                    Cloud-hosted                    Local-first
                    ┌───────────────────────────────────────────┐
                    │                           │               │
  Framework /       │  LlamaIndex    LangChain  │               │
  Build-it-yourself │  Pinecone      Weaviate   │  ChromaDB     │
                    │  Qdrant        Vectara    │               │
                    │                           │               │
                    ├───────────────────────────┼───────────────┤
                    │                           │               │
  Product /         │  Mem0 Cloud    Zep Cloud  │  ★ CORTEX ★   │
  Works-out-of-box  │  Notion AI     Mem.ai     │  Obsidian     │
                    │  Glean                    │  AnyType      │
                    │                           │               │
                    └───────────────────────────┴───────────────┘
```

**Cortex occupies the only quadrant that is both local-first AND a batteries-included product.** Obsidian is local but manual. ChromaDB is local but just a component. Everything else is cloud.

---

## 3. Target Users & Domains

### Primary Target Users (Ranked by Fit)

#### Tier 1: Bulls-eye

**1. AI-Augmented Developers (Claude Code / Cursor / Cline users)**

The #1 target. These developers already feel the pain and are actively seeking solutions.

- Claude Code's CLAUDE.md is limited to ~200 lines of static rules. MEMORY.md grows but becomes unwieldy
- claude-mem hit 46.1K GitHub stars — proving massive demand for persistent memory
- *"Every time you open Claude Code, it starts from zero. It doesn't remember your codebase, your decisions, or the conversation you had yesterday."*
- *"I keep running into the same wall — they forget everything between sessions. I can dump the entire conversation history into every prompt, but that burns through tokens fast and doesn't scale."* (Indie Hackers)

**Segment size:** MCP ecosystem = 97M+ monthly SDK downloads. Claude Code, Cursor, Windsurf, Cline = millions of active developers.

**2. Solo Developers / Indie Hackers (Multi-project)**

- Context switching between projects is brutal with session-based AI
- Can't afford to re-explain architecture and conventions every session
- Value local-first (no recurring storage costs), CLI-first workflows
- Karpathy's LLM Wiki approach went viral in April 2026 because this group wanted accumulated knowledge without cloud dependencies

**3. AI Engineers Building Agent Systems**

- Every agent framework has a memory problem
- Mem0 benchmarks: full-context = 72.9% accuracy but 17s latency + ~26K tokens; vector memory = 66.9% but 1.44s + ~1.8K tokens
- Need pluggable memory with structured knowledge, not just embeddings

#### Tier 2: Strong Fit

**4. Researchers / Academics** — Drowning in papers, need synthesis not just retrieval. Entity graph linking authors/concepts/findings across hundreds of papers.

**5. DevRel / Developer Advocates** — Maintain knowledge across dozens of products, APIs, discussions. Need semantic search with fact-level provenance.

**6. Technical Writers** — Detecting contradictions, outdated facts, and gaps across large doc sets.

#### Tier 3: Adjacent (Growth)

**7. Consulting Knowledge Workers** — Institutional knowledge across engagements. Need UI layer though.

**8. Small Dev Teams (2-5 people)** — Shared knowledge base for Claude Code/Cursor users. Natural expansion from single-user.

### Target Domains (Ranked)

| Rank | Domain | Opportunity | Fit Level | Notes |
|------|--------|-------------|-----------|-------|
| 1 | **Software Development** | Highest | Native | Users already live here. CLI-native. MCP adoption exploding |
| 2 | **Research / Academia** | High | Strong | Paper synthesis, concept graphs, automated literature review |
| 3 | **Legal / Compliance** | High | Needs API/UI | Fact extraction from contracts, entity linking across cases, temporal regulation tracking |
| 4 | **Technical Education** | Medium | Natural | Course material cross-referencing, knowledge base from curriculum |
| 5 | **Healthcare** | Medium | High barriers | Local-first = HIPAA advantage, but needs certification |
| 6 | **Consulting** | Medium | Needs UI | Institutional knowledge capture across engagements |

### User Pain Points Cortex Solves

| Pain Point | Evidence | Cortex Solution |
|-----------|----------|-----------------|
| **AI amnesia between sessions** | *"Your AI partner forgets everything and starts suggesting the same wrong approaches"* | Persistent fact store + MCP search. Claude Code recovers full context at session start |
| **Context window = junk drawer** | *"Too many teams treat context windows like junk drawers, dumping everything inside"* + models degrade at >50% of stated context | Atomic facts with importance scoring + hot-context. Only high-signal facts injected |
| **RAG rediscovers knowledge every time** | Karpathy: *"The LLM is rediscovering knowledge from scratch on every question. There's no accumulation."* | Facts extracted and stored with entity relationships. Knowledge compounds over time |
| **Token costs explode with full-context** | *"Naive workarounds like long prompts bloat costs by 300% without improving recall"* | Hybrid search retrieves precisely relevant facts. ~1.8K tokens vs ~26K for full-context |
| **Knowledge fragmented across tools** | Docs, Slack, GitHub, notes, code — all siloed | Ingest from any source. Single knowledge graph regardless of origin |
| **No provenance in AI responses** | Can't verify where the AI got its information | Every fact links to source document and chunk. Full provenance chain |

---

## 4. Pricing & Monetization Strategy

### Competitor Pricing Matrix

| Product | Free Tier | Paid Tiers | Enterprise | Model |
|---------|-----------|------------|------------|-------|
| Mem0 | 10K adds/mo, 1K retrievals | Starter $19/mo, Pro $249/mo | Custom (SSO, on-prem) | Cloud SaaS |
| Zep | 1K credits/mo | Flex ~$25/mo | Custom (BYOK, BYOC) | Cloud SaaS |
| Pinecone | 2GB, 2M writes/mo | Standard $50/mo+, Enterprise $500/mo+ | BYOC | Cloud SaaS |
| Weaviate | Self-host free | Flex $45/mo, Plus $280/mo | Dedicated infra | Both |
| ChromaDB | Self-host free; cloud 1M embeddings | Usage-based | Custom | Both |
| Obsidian | Core free forever | Sync $4/mo, Publish $8/mo | $50/user/yr | Local + optional cloud |
| Notion AI | Free (no AI) | Plus $10 + AI $10/user/mo | Custom | Cloud SaaS |
| Pieces | Free forever | Pro $18.99/mo | Teams custom | Local + cloud AI |
| Mem.ai | 25 notes + 25 chats/mo | Pro $12/mo | N/A | Cloud SaaS |
| Reflect | 14-day trial | $10/mo all features | N/A | Cloud SaaS |

### Recommended Monetization Models (Ranked)

#### Model 1: Open Core + Cloud Hosted (Best Long-term Fit)
Core engine stays free. Managed cloud version with hosted Postgres, sync, teams, dashboard.
- **Precedent:** Supabase ($70M ARR), Plausible ($2M+ ARR, 2-person team)
- **Revenue potential:** $5K-20K MRR within 12-18 months

#### Model 2: Sponsorware / Premium Features (Best Early Fit)
Premium features (team sharing, PDF parsers, graph visualization) go to GitHub Sponsors first.
- **Precedent:** Material for MkDocs (~$20K/mo), Caleb Porzio ($1M+ cumulative)
- **Revenue potential:** $500-5,000/mo depending on community

#### Model 3: Obsidian Model — Free Core + Paid Cloud Services (Strong Fit)
Charge for: Cortex Sync ($5-8/mo), Cloud Backup ($3-5/mo), Cortex Publish ($8-10/mo), Teams ($15-20/mo/user)
- **Precedent:** Obsidian ($25M ARR, 7-person team)

#### Model 4: Usage-Based API / Managed LLM Layer (Good Fit)
Managed endpoint for ingestion/extraction without own Anthropic key. Per-operation billing.
- **Precedent:** Mem0 ($19-249/mo), Pinecone (per-operation)

### Recommended Pricing Roadmap

#### Phase 1: Build Traction (Now → 1,000 Stars)

**Give away:** Everything. Full engine, CLI, MCP, all parsers, all features. Zero restrictions.

**Monetize via GitHub Sponsors:**
- Hobbyist: $5/mo (name in README)
- Developer: $10/mo (priority issues, sponsor Discord)
- Power User: $25/mo (early access / sponsorware)
- Team/Agency: $100/mo (1hr/mo async consulting)

**Target:** $500-2,000/mo

#### Phase 2: Premium Add-ons (1,000 → 5,000 Stars)

**Keep free:** Core engine, CLI, MCP, local operation

**Launch paid:**
- **Cortex Pro** ($9/mo or $89/yr): Premium parsers (PDF, DOCX, Confluence, Slack), analytics dashboard, advanced graph visualization
- **Cortex Sync** ($5/mo or $49/yr): Encrypted cross-machine sync

**Target:** $2,000-8,000/mo (5-15% conversion)

#### Phase 3: Cortex Cloud (5,000+ Stars)

- Free tier: 1,000 facts, 500 searches/mo
- Individual: $19/mo — 50K facts, unlimited search, all parsers, web dashboard
- Team: $49/mo/seat — shared knowledge bases, permissions, API
- Enterprise: Custom — SSO, audit logs, dedicated instance, SLA

**Target:** $10,000-50,000/mo

### Milestone Triggers

| Milestone | Action |
|-----------|--------|
| 100 stars | Set up GitHub Sponsors |
| 500 stars | Launch sponsorware for 1-2 premium features |
| 1,000 stars | Launch Cortex Pro ($9/mo) |
| 2,500 stars | Launch Cortex Sync ($5/mo) |
| 5,000 stars + 500 paying users | Begin Cortex Cloud |
| 10,000 stars + $10K MRR | Consider raising or going full-time |

---

## 5. Market Gaps & Opportunities

### Gap 1: Local-First + Real Intelligence Is Rare
Most tools force a choice: cloud-hosted intelligence OR local-but-dumb storage. Mem0's graph features are paywalled at $249/mo. Zep's graph construction exceeds 600K tokens and takes hours. MemPalace overstated claims and shipped with MCP bugs.

### Gap 2: Pure Vector Search Fails at Scale
40-60% of RAG implementations fail to reach production. Embeddings are lossy. Claude Code, Cursor, and Devin have moved away from vector databases to grep + file trees. Hybrid search (vector + keyword + graph) is now 2026 best practice — which Cortex already implements.

### Gap 3: Memory Frameworks Lock You In
Letta requires its runtime. Mem0's best features are cloud-only. Zep adds $15/million tokens. Cortex is a service other tools consume, not a framework you're locked into.

### Gap 4: No Temporal Reasoning
Most systems store facts without temporal modeling. Mem0 can't tell you "this user switched from Python to Rust six months ago." Cortex already has `valid_from`/`valid_until` fields — just needs surfacing.

### Gap 5: Team Knowledge Is Underserved
AI memory frameworks were built for personalization, not institutional knowledge. No team-level shared context in Claude Code. Teams can't build common AI memory.

### Gap 6: Knowledge Graph Construction Is Prohibitively Expensive
Microsoft GraphRAG costs $33K for large datasets. Cortex does entity extraction + graph construction locally using Claude Haiku — orders of magnitude cheaper.

### "Only Tool That..." Statements

1. Cortex is the **only local-first knowledge engine combining three layers** — chunks, atomic facts (with AUDM dedup), and entity graph — in a single embedded database, zero cloud dependency
2. Cortex is the **only MCP-native memory tool using Ollama (free local embeddings) + Claude (structured extraction)**, entirely on the developer's machine, no Docker
3. Cortex is the **only tool performing AUDM deduplication on atomic facts at ingestion time** — preventing knowledge corruption from append-only systems
4. Cortex runs a **4-stage entity resolution cascade** (exact → fuzzy/Levenshtein → embedding similarity → LLM verification) — sophistication typically found in $50K+/yr enterprise tools
5. Cortex is the **only CLI-first knowledge engine designed for developer workflow** — infrastructure that AI assistants consume via MCP, like a database

---

## 6. High-Value Feature Opportunities

### Tier 1: High Impact, Moderate Effort

| Feature | Impact | Effort | Why |
|---------|--------|--------|-----|
| **Obsidian vault ingestion** (wikilink-aware, backlink-to-entity mapping) | 9/10 | 3/10 | Taps 1.5M Obsidian users. Mostly wiring on existing markdown parser |
| **Slack/Discord conversation ingestion** | 8/10 | 5/10 | Every workspace is institutional knowledge. Addresses team gap |
| **Temporal fact queries** ("What changed since last month?") | 8/10 | 4/10 | `valid_from`/`valid_until` fields already exist. Differentiates vs. Mem0's temporal weakness |
| **Git commit/PR ingestion** (`cortex ingest --git`) | 8/10 | 4/10 | Technical decisions live in PRs. No competitor does this locally |

### Tier 2: High Impact, Higher Effort

| Feature | Impact | Effort | Why |
|---------|--------|--------|-----|
| **Multi-agent shared memory / team knowledge** | 9/10 | 7/10 | Hottest research area in 2026. Shared brain for dev teams |
| **LongMemEval benchmark results** | 7/10 | 5/10 | Benchmarks = credibility currency. Even 70%+ beats Mem0's 49% |
| **Watch/auto-ingest mode** (`cortex watch ~/docs`) | 7/10 | 4/10 | Zero-friction continuous knowledge building via fsevents |
| **Episodic memory** (session summaries — what was built, decided, tried) | 7/10 | 5/10 | Completes the three-type memory model (semantic + episodic + procedural) |

### Tier 3: Strategic, Longer-term

| Feature | Impact | Effort | Why |
|---------|--------|--------|-----|
| **GDPR/EU AI Act compliance tooling** (`cortex export --gdpr`, `cortex forget --entity`) | 6/10 | 3/10 | August 2026 enforcement deadline. Local-first = compliance advantage by architecture |
| **Streaming ingestion from conversations** (enhance `cortex remember`) | 7/10 | 6/10 | Context engineering paradigm — memory accumulates during work, not via batch |

---

## 7. Emerging Trends Favoring Cortex

| Trend | Timing | Cortex Alignment |
|-------|--------|-----------------|
| **Context engineering as a discipline** | NOW | Cortex IS a context engine. Reframe from "knowledge base" to "context engine" |
| **Hybrid RAG as default architecture** | Already here | Cortex already implements vector + keyword + graph enhancement via RRF |
| **PGlite explosive growth** (500K → 13M weekly downloads in one year) | NOW | Early bet on PGlite. Zero-setup story only gets stronger |
| **Sovereign AI / local-first processing** | Accelerating | Privacy-enhancing tech market: $3-4B → $12-28B by 2030-2034 |
| **MCP as universal standard** | NOW | MCP-native from day one. On the right side of the standard |
| **Multi-agent knowledge sharing** | 12-18 months | Cortex could serve as shared knowledge substrate for agent fleets |
| **Claude Code memory limits** | NOW | CLAUDE.md + MEMORY.md acknowledged as limited. Cortex is the upgrade path |

---

## 8. Risks & Threats

| Risk | Level | Description | Mitigation |
|------|-------|-------------|------------|
| **Anthropic's native memory gets too good** | MEDIUM-HIGH | Auto Memory + Auto Dream already handles session persistence. If Anthropic adds doc ingestion + entity graphs natively, Cortex's value narrows | Position as knowledge layer beneath auto-memory (session prefs vs. organizational knowledge). Emphasize multi-tool compatibility, data sovereignty |
| **Mem0 open-source expansion** | MEDIUM | If Mem0 unpaywalls graph features or adds local mode, they absorb Cortex's positioning | Three-layer architecture + AUDM is deeper than Mem0's three-tier scoping |
| **"Good enough" MCP memory tools** | MEDIUM | OpenMemory, mcp-memory-service, claude-mem proliferating. Simpler = lower friction | Depth (AUDM, 4-stage entity resolution, hybrid search) is hard to replicate. Win on quality of recall |
| **Long context windows reduce RAG demand** | LOW-MEDIUM | 1M+ token windows available. For small KBs, retrieval is overhead | Expensive ($1.25/query at 500K tokens), slow (20-30s TTFT), "lost in the middle" problem. Structured retrieval essential for non-trivial KBs |
| **Enterprise players enter space** | MEDIUM | Oracle AI Agent Memory SDK, IBM Sovereign Core, Google Gemini persistent memory | Developer-first, open-source positioning targets a segment enterprise vendors serve poorly |
| **No published benchmarks** | LOW-MEDIUM | 2026 memory space is benchmark-driven. MemPalace's overstated claims caused credibility crisis | Run LongMemEval, publish honest results. Modest scores with honest methodology > inflated claims |

---

## 9. Go-to-Market Recommendations

### Positioning Statement

> **Cortex: The local context engine that gives your AI persistent, structured memory.**
> Your AI forgets everything. Cortex remembers — locally, structured, with provenance.

### Adoption Channels (Ranked by ROI)

| Rank | Channel | Why | Approach |
|------|---------|-----|----------|
| 1 | **HackerNews "Show HN"** | Highest ROI for dev tools. Community values: OSS, local-first, CLI, novel architecture | "Show HN: Cortex — A local knowledge engine that gives Claude Code persistent memory with entity graphs" |
| 2 | **r/LocalLLaMA** (266K+ members) | Values local-first, privacy-preserving. Ollama is their beloved tool | Practical demo: ingest codebase → Claude Code querying via MCP. Before/after |
| 3 | **r/selfhosted** | Self-promotion expected. PGlite (no Docker) is a huge selling point | Focus on zero-infrastructure angle |
| 4 | **Claude Code community** (GitHub Discussions) | Primary target users. claude-mem's 46K stars proves hunger | Migration guide from CLAUDE.md-only to Cortex MCP |
| 5 | **r/ObsidianMD + PKM communities** | 1.5M+ users who think in graphs. Frustrated with manual linking | "Like Obsidian's graph view, but the graph builds itself" |
| 6 | **Dev.to / Hashnode** | Sustained organic traffic | Architecture deep-dives: PGlite + pgvector, AUDM, entity resolution cascade |
| 7 | **MCP server registries** | 10,000+ servers in registry. Natural discovery channel | Get listed on PulseMCP, LobeHub, official Anthropic registry |
| 8 | **Product Hunt** | Good visibility spike | Secondary launch after HN/Reddit validation |

### Launch Sequence

1. **Week 1-2:** Polish README. Record 2-minute terminal demo (ingest → search → Claude Code via MCP). Make install a single `npm install -g`
2. **Week 3:** Show HN + same-day r/LocalLLaMA + r/selfhosted. Frame around Karpathy LLM Wiki moment: "What if your knowledge base built itself?"
3. **Week 4:** Technical deep-dive blog post on architecture (AUDM, entity resolution, PGlite + pgvector)
4. **Week 5-6:** MCP server registries. Claude Code GitHub Discussion with migration guide
5. **Ongoing:** Ship weekly, share progress. Every release = new post opportunity

### The Obsidian Playbook

Obsidian reached $25M ARR and $350M valuation with a 7-person team by:
- Free core product, deeply loved by developers
- Privacy-first, local-first architecture
- Paid cloud services (Sync, Publish) that solve real pain points
- Plugin ecosystem that creates switching costs
- Community-driven growth, not marketing spend

Cortex can follow this exact playbook with a more AI-native architecture.

---

## 10. Sources

**Market Sizing:**
- Research and Markets — Personal Knowledge Base AI Market 2026
- Research and Markets — AI-Driven Knowledge Management System Market 2026
- MarketsandMarkets — RAG Market Report
- Fortune Business Insights — Knowledge Management Software Market
- Precedence Research — AI Code Tools Market
- Fortune Business Insights — Vector Database Market

**Competitors:**
- TechCrunch — Mem0 $24M Series A (Oct 2025)
- CNBC — Glean $7.2B Valuation (June 2025)
- Futurum — Glean Doubles ARR to $200M
- Fueler — Obsidian Statistics 2026

**Trends:**
- a16z — "Your Data Agents Need Context" (March 2026)
- a16z — "The Trillion Dollar AI Software Development Stack"
- Stack Overflow 2025 Developer Survey
- JetBrains AI Coding Tools Survey 2026
- Pragmatic Engineer — AI Tooling for Software Engineers 2026
- SitePoint — Definitive Guide to Local-First AI 2026
- Zuplo — State of MCP Report
- Electric SQL — PGlite v0.4 Announcement

**Pain Points & Community:**
- Oracle Developers Blog — Agent Memory: Why Your AI Has Amnesia
- LogRocket — The LLM Context Problem
- Indie Hackers — AI Memory Discussions
- Atlan — LLM Context Window Limitations
- Karpathy — LLM Wiki (April 2026)

**Gaps & Opportunities:**
- Stack AI — RAG Limitations 2026
- Mem0 — State of AI Agent Memory 2026
- Machine Learning Mastery — Vector DB vs Graph RAG
- Anthropic — Effective Context Engineering for AI Agents
- Medium/Graph Praxis — Graph RAG in 2026: A Practitioner's Guide
