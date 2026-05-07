# Cortex — Product & Go-to-Market Strategy

**Date:** April 13, 2026
**Companion:** [MARKET-RESEARCH.md](./MARKET-RESEARCH.md) for full market data, competitor pricing, and gap analysis

---

## The Big Idea

Everyone builds memory for **one thing** — Mem0 for chatbots, claude-mem for sessions, Obsidian for notes. But you are a single person with a single brain. Your knowledge doesn't fragment by tool — it fragments by **context**.

**Cortex = Memory OS. Pods = Isolated contexts. Synapses = Shared knowledge.**

```
┌─────────────────────────────────────────────────────────┐
│                     CORTEX (Memory OS)                  │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ Sessions │  │ Agents  │  │Personal │  │  Work   │   │
│  │   Pod    │  │   Pod   │  │  Pod    │  │  Pod    │   │
│  │          │  │         │  │         │  │         │   │
│  │ Claude   │  │ Agent A │  │ Notes   │  │ Slack   │   │
│  │ Codex    │  │ Agent B │  │ Emails  │  │ Jira    │   │
│  │ Cursor   │  │ Agent C │  │Bookmarks│  │ Docs    │   │
│  └────┬─────┘  └────┬────┘  └────┬────┘  └────┬────┘   │
│       │             │            │             │        │
│       └─────────────┴─────┬──────┴─────────────┘        │
│                           │                             │
│                     ✦ Synapses ✦                        │
│               (shared knowledge links)                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Unified Knowledge Graph                │   │
│  │     Facts · Entities · Relations · History        │   │
│  │         PGlite + pgvector (local)                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Why This Wins

| What exists today | What Cortex becomes |
|---|---|
| claude-mem stores session logs | Cortex **Sessions Pod** stores structured facts with entity graph |
| Mem0 gives ONE agent memory | Cortex **Agents Pod** gives each agent its own brain + shared knowledge |
| Obsidian stores notes you write | Cortex **Personal Pod** auto-extracts from notes, emails, bookmarks |
| Slack/Jira knowledge is siloed | Cortex **Work Pod** ingests connectors into searchable facts |
| Each tool is isolated | **Synapses** let knowledge flow between pods on your terms |

### The Synapse Concept — The Real Differentiator

Pods are isolated by default (privacy, relevance). Synapses are explicit knowledge-sharing links:

```bash
# Each agent gets its own pod
cortex pod create --name "research-agent" --type agent
cortex pod create --name "code-agent" --type agent

# Share specific knowledge between them
cortex synapse create research-agent code-agent --filter "topic:architecture"

# Personal notes feed into coding sessions
cortex synapse create personal sessions --filter "tag:til"

# Work Slack stays isolated from personal (no synapse = no sharing)
```

This maps to human cognition. Your brain has regions that share through neural pathways — but not everything shares with everything. You don't think about your grocery list while coding.

---

## Positioning

### Category
**Memory OS for developers** — not "another memory tool," not "a RAG framework," not "a note-taking app."

### One-liner
> Cortex gives your AI a persistent brain — isolated pods for sessions, agents, and notes, with shared knowledge through synapses. Fully local.

### Launch tagline (pick one)
- **"Remember everything. Retrieve anything."** — parallel structure, action-oriented
- **"Context that persists."** — double meaning (LLM context + programming context), two words
- **"One brain. Many minds."** — captures pods-as-specialized-regions

### The "only" statements
1. Only tool combining **three knowledge layers** (chunks + atomic facts + entity graph) in a single embedded database, zero cloud
2. Only tool with **isolated memory pods** that share knowledge through explicit synapses
3. Only tool performing **AUDM deduplication** on facts at ingestion — preventing knowledge corruption
4. Only tool running a **4-stage entity resolution cascade** (exact → fuzzy → embedding → LLM verify) — sophistication typically found in $50K+/yr enterprise tools
5. Only **CLI-first, MCP-native** knowledge engine designed as infrastructure AI assistants consume

### Positioning vs. competitors

| Factor | Cortex | Mem0 | claude-mem | Obsidian | LlamaIndex |
|--------|--------|------|------------|----------|------------|
| Isolated memory pods | Yes | No (flat) | No (single) | Vaults (manual) | No |
| Cross-pod knowledge sharing | Yes | No | No | No | No |
| Entity graph (4-stage resolution) | Yes | Paid only | No | Manual links | No |
| Atomic facts + AUDM dedup | Yes | Basic | No | No | No |
| Hybrid search (vector+keyword+graph) | Yes | Vector only | No search | Plugin | Framework |
| Fully local (embedded DB, no Docker) | Yes | Cloud-first | Files only | Yes | Requires infra |
| MCP-native | Yes | No | Yes | Plugin | No |
| Multi-agent memory | Pods + synapses | API scoping | No | No | Framework |
| CLI-first | Yes | API-first | Yes | GUI-first | Library |

### Competitive positioning map

```
                    Cloud-hosted                    Local-first
                    ┌───────────────────────────────────────────┐
                    │                           │               │
  Framework /       │  LlamaIndex    LangChain  │               │
  Assembly-required │  Pinecone      Weaviate   │  ChromaDB     │
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

Cortex is the **only** product in the local-first + works-out-of-box quadrant with real AI intelligence (entity graph, fact extraction, hybrid search).

---

## The Wedge Strategy

Do NOT launch as "universal memory layer." Too abstract. Nobody searches for it. Nobody knows they need it.

**Launch wedge:** "Persistent memory for AI coding assistants."

**Why this wedge:**
- claude-mem hit 46.1K GitHub stars — proven demand
- MCP has 97M+ monthly SDK downloads — distribution channel exists
- You already dogfood this exact use case
- Smallest surface area (CLI + MCP, no connectors needed)
- Fastest path to "Show HN" moment

**Wedge positioning:**
> "Cortex gives your AI coding assistant a persistent brain. Ingest your docs, codebase, and decisions once — every future session starts with full context. Local-first, zero-cloud, works with Claude Code / Cursor / any MCP client."

After proving the wedge, expand narrative to pods → synapses → universal memory.

---

## Rollout Plan

### Phase 0: Foundation (Current → v1.0) — 4-6 weeks

Add the **pod abstraction layer** on top of existing infrastructure:

```bash
cortex pod create --name "my-project" --type session
cortex pod use my-project
cortex ingest ./docs/**/*.md
cortex search "auth flow"
```

Under the hood: pods are namespaces. Add `pod_id` column to facts, entities, chunks. Filter by active pod on every query. Minimal code change, massive conceptual upgrade.

**Checklist:**
- [ ] Pod CRUD (`cortex pod create/list/use/delete`)
- [ ] MCP tools scoped to active pod
- [ ] `cortex init` — auto-detect project, suggest first ingest
- [ ] Zero-install experience: `npx @anmol-srv/cortex` works end-to-end
- [ ] README that functions as landing page: problem → 15s GIF → one-command install → 3 examples

### Phase 1: Sessions Pod Launch (v1.0) — Month 1

**Ship:**
- Pod-scoped MCP tools
- `cortex remember "fact"` for quick saves during sessions
- `cortex search` with pod isolation
- CLAUDE.md integration guide
- Publish to npm with keywords: mcp, claude-code, memory, context, rag

**Launch:**
- Show HN: *"Show HN: Give your AI coding assistant a persistent brain (local-first, PGlite, MCP)"*
- Submit to MCP server registries (PulseMCP, LobeHub, official Anthropic registry)
- Blog post: *"Why your AI coding assistant forgets everything (and how to fix it)"*

**Metrics:** npm installs/week, GitHub stars, time-to-first-ingest (<3 min target)

### Phase 2: Feedback & Hardening — Month 2-3

**Ship:**
- Fix every issue. <24hr response time on GitHub.
- `cortex doctor` for diagnosing setup issues
- Auto-ingest from git commit history
- `cortex status` dashboard in CLI (docs ingested, facts extracted, queries served)
- `cortex watch "docs/**/*.md"` for auto-ingest on file changes
- Search quality improvements based on real usage

**Distribute:**
- Product Hunt launch (Tuesday/Wednesday)
- Technical deep-dive: *"AUDM: How Cortex deduplicates knowledge without losing information"*
- Comparison post: *"Cortex vs. Mem0 vs. Supermemory: architectural differences explained"*
- r/ClaudeAI, r/LocalLLaMA, r/selfhosted

**Community:**
- GitHub Discussions (not Discord yet — you're one person)
- Personally message everyone who stars the repo in first 2 weeks
- Create `good first issue` labels

**Metrics:** Day-7 retention >25%, issues opened/resolved, 200 stars target

### Phase 3: Agents Pod (v1.1) — Month 4-5

**Why agents second:** Natural extension of sessions. Hottest market trend (multi-agent, agentic coding). This is where **synapses debut**.

**Ship:**
- Agent-specific pod type with API access
- Synapse primitive (pod-to-pod knowledge links with filters)
- `cortex agents status` — fleet dashboard
- SDK/library for programmatic ingestion from agent code

**Distribute:**
- "Mini Launch Week" (3 days, Supabase-style): Day 1 = pods, Day 2 = agent memory, Day 3 = synapses
- Blog: *"Give each agent its own brain. Let them share what matters."*

**Community:**
- Launch "Pioneers" program: 20-30 power users with direct access
- Open public roadmap (GitHub Projects)
- 500 stars target

### Phase 4: Personal Pod (v1.2) — Month 6-7

**Ship:**
- Obsidian vault ingestion (wikilink-aware, backlink-to-entity mapping)
- Email ingestion (Gmail export, .mbox)
- Bookmark/URL batch ingestion
- Synapses: personal → sessions (notes inform coding)

**Distribute:**
- v1.0 launch across all channels
- r/ObsidianMD: *"Like Obsidian's graph view, but the graph builds itself"*
- Blog: *"From coding memory to universal memory: introducing Cortex pods"*

**Metrics:** 1,000 stars, 500+ weekly npm downloads, 5+ external contributors

### Phase 5: Work Pod (v1.3) — Month 8-10

**Ship:**
- Slack workspace ingestion
- Jira/Linear ticket ingestion
- Shared pods (team knowledge base)
- Access controls (read/write per pod)

**This is where monetization kicks in.** Teams pay.

### Phase 6: Multiplayer (v2.0) — Month 10-12

**Ship:**
- `cortex serve` mode — lightweight API for multi-agent/multi-user
- Team features: shared pods, conflict resolution, concurrent ingestion
- Cortex Cloud (managed offering)

---

## Monetization Roadmap

### Phase 1: Build Traction (Now → 1,000 Stars)

**Everything free.** Full engine, CLI, MCP, all parsers, zero restrictions.

**GitHub Sponsors:**
| Tier | Price | Perk |
|------|-------|------|
| Hobbyist | $5/mo | Name in README, sponsor badge |
| Developer | $10/mo | Priority issues, sponsor-only channel |
| Power User | $25/mo | Early access to new features (sponsorware) |
| Team/Agency | $100/mo | 1hr/mo async consulting, logo in README |

**Target:** $500-2,000/mo from 50-200 sponsors

### Phase 2: Premium Add-ons (1,000 → 5,000 Stars)

**Keep free:** Core engine, CLI, MCP, all current features

**Launch:**
- **Cortex Pro** ($9/mo or $89/yr): Premium parsers (PDF, DOCX, Confluence, Slack archive), analytics dashboard, advanced graph visualization, priority extraction queue
- **Cortex Sync** ($5/mo or $49/yr): Encrypted cross-machine sync

Use Polar.sh or Lemon Squeezy for billing. License key unlocks premium features in CLI.

**Target:** $2,000-8,000/mo (5-15% conversion of active users)

### Phase 3: Cortex Cloud (5,000+ Stars, Proven PMF)

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 1,000 facts, 500 searches/mo, 10 docs |
| Individual | $19/mo | 50K facts, unlimited search, all parsers, 5GB, web dashboard |
| Team | $49/mo/seat | Shared pods, permissions, team analytics, API |
| Enterprise | Custom | SSO, audit logs, dedicated instance, SLA, on-prem |

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

### Revenue benchmarks (solo dev / small team)

| Comparable | Revenue | Team |
|-----------|---------|------|
| Obsidian | $25M ARR | 7 people |
| Material for MkDocs (sponsorware) | ~$20K/mo | 1 person |
| Caleb Porzio (Alpine.js/Livewire) | $1M+ cumulative | 1 person |
| Plausible Analytics | $2M+ ARR | 2 people |

**Realistic solo-dev target:** $5K-10K MRR within 18 months using Sponsors + Pro tier.

---

## Brand Identity

### Name: "Cortex"

**Conflicts:** Palo Alto Networks Cortex, Snowflake Cortex AI, Cortex.io (YC-backed). None are in the personal dev tool space.

**Mitigation:** Own the niche with a differentiating domain (`getcortex.dev`, `usecortex.dev`). If ever needed to pivot: **Engram** (a memory trace in the brain — literally what we build), **Mnemo**, or **Gyrus**.

**Keep "Cortex" for now.** The enterprise players aren't in your lane.

### Visual Identity

**School:** Supabase model — dark base + one strong signature color.

**Color palette ("Neural Violet"):**

| Role | Hex | Use |
|------|-----|-----|
| Background (deep) | `#0A0E1A` | Dark, cool, neural void |
| Surface | `#141B2D` | Cards, panels, lifted surfaces |
| Brand primary | `#8B5CF6` | Electric violet — wisdom, memory, the cerebral |
| Brand secondary | `#22D3EE` | Soft cyan — synaptic spark, connection color |
| Accent | `#F59E0B` | Warm amber — retrieval moments, "aha" |
| Text primary | `#E2E8F0` | Off-white, high readability on dark |
| Text secondary | `#94A3B8` | Muted slate, de-emphasized |

**Why purple:** Most underused primary in dev tool landscape. Vercel owns black. Supabase owns green. Linear owns desaturated blue. GitHub owns dark+green. Purple = wisdom, memory, neural activity. Unclaimed.

**Why cyan secondary:** The "synaptic spark" — when pods connect or knowledge is retrieved. Purple + cyan on dark = high contrast, neural, developer-native.

### Typography
- **Display/headings:** Inter, Geist, or Satoshi (geometric sans)
- **Code/CLI:** JetBrains Mono or Berkeley Mono (critical for a CLI tool)
- **Consider monospace as primary** — the "Technical Mono" trend is authentic for a CLI-first tool

### Logo (achievable with zero budget)

**Option A — Monospace wordmark:** The word `cortex` in JetBrains Mono, lowercase. Possibly with the `o` as a small neural node (circle with radiating dots). Simplest, most developer-native.

**Option B — Bracket brain:** `{cortex}` — name in curly braces. Zero design skill. Immediately signals "developer tool."

**Option C — Neural glyph:** Stylized "C" from two concentric arcs (brain folds). Works as favicon. Achievable in Figma in an afternoon.

**Start with Option A.** Evolve later.

### Visual vocabulary for pods

| Concept | Term | Visual |
|---------|------|--------|
| The system | Cortex | Outer ring, purple |
| Memory spaces | Pods | Circles/nodes, color variants |
| Knowledge sharing | Synapses | Thin lines between nodes, cyan |
| Stored knowledge | Engrams | Small dots within pods |
| Active retrieval | Neural firing | Pulse/glow along connection |
| Cross-pod search | Global recall | Ripple from center outward |

### Tone of voice

**"Quiet authority with biological warmth."**

- **Precise, not clever.** Say exactly what something does.
- **Declarative, not salesy.** "Cortex remembers" not "Cortex can help you remember!"
- **Biological metaphors sparingly but consistently.** "Pods" not "workspaces." "Remember" not "store." "Recall" not "retrieve."
- **No exclamation marks in product copy.** Ever.
- **Short sentences. Short paragraphs.** Developers scan.
- **Opinionated.** "Your AI sessions should not start from zero" is a stance.
- **Technical when warranted, plain when not.**

**Example copy:**

> Every conversation starts from zero. Every agent forgets what you told the last one. Every project loses context when you close the tab.
>
> Cortex remembers.
>
> It is a memory layer that sits beneath your tools — your editors, your agents, your scripts. Knowledge goes in. Knowledge comes back. Across sessions. Across projects. Across time.
>
> One brain. Many pods. Persistent context.

### CLI personality

```
$ cortex status

  brain: healthy
  pods: 4 active (coding, notes, agents, email)
  engrams: 12,847 facts across 3 synapses
  last synapse: coding ←→ agents (2 min ago)
```

The metaphor is subtle in the interface — "remember" instead of "store," "recall" instead of "retrieve," "pods" instead of "namespaces." Never break character in user-facing copy.

---

## Content Strategy

### First 6 months of posts

| Month | Post | Purpose | Channel |
|-------|------|---------|---------|
| 1 | "Why your AI coding assistant forgets everything" | Launch, problem-first | Blog → HN, DEV.to |
| 2 | "AUDM: How Cortex deduplicates knowledge" | Technical depth, credibility | Blog → HN |
| 2 | "Cortex vs. Mem0 vs. Supermemory" | SEO, comparison traffic | Blog |
| 3 | "Three layers of knowledge: why vector search alone isn't enough" | Thought leadership | Blog → HN |
| 4 | "Building a memory engine with PGlite" | Rides PGlite community | Blog → HN |
| 5 | "From coding memory to universal memory: introducing pods" | Expand narrative | Blog, all channels |
| 6 | "How I use Cortex across my entire workflow" | Dogfooding, authenticity | Blog, Twitter/X |

### Ongoing cadence

| Type | Frequency | Where |
|------|-----------|-------|
| Build-in-public updates | Weekly | Twitter/X, GitHub Discussions |
| Technical deep-dives | 1x/month | Blog → HN |
| Comparison posts | 1x/quarter | Blog (SEO) |
| Screencasts/demos | 1x/month | YouTube, Twitter/X |
| Changelog | Every release | GitHub Releases |

### Where NOT to post
- Medium (low SEO, paywalled)
- LinkedIn (wrong audience for CLI tools)
- Newsletter (wait until 500+ stars)

---

## Key Metrics by Phase

| Phase | Timeline | North Star | Supporting |
|-------|----------|------------|-----------|
| Launch | Month 1 | Time-to-first-ingest < 3 min | npm installs, stars |
| Validation | Month 2-3 | Day-7 retention > 25% | Issues opened, searches/user |
| Traction | Month 4-5 | Weekly active users > 100 | Contributors, organic mentions |
| Growth | Month 6 | 1,000 GitHub stars | 500+ npm weekly, 5+ contributors |
| Scale | Month 12 | $5K MRR | Team adoption, pod diversity |

---

## Adoption Channels (Ranked)

| Rank | Channel | Audience | Approach |
|------|---------|----------|----------|
| 1 | HackerNews "Show HN" | Power devs | "Give your AI coding assistant a persistent brain" |
| 2 | r/LocalLLaMA (266K) | Local-first AI devs | Demo: ingest → Claude Code query. Before/after |
| 3 | r/selfhosted | Self-hosters | Zero-infrastructure angle (PGlite, no Docker) |
| 4 | Claude Code community | Primary target | Migration guide from CLAUDE.md to Cortex MCP |
| 5 | r/ObsidianMD + PKM | Note-takers | "Graph view that builds itself" |
| 6 | MCP registries | MCP ecosystem | Get listed everywhere |
| 7 | DEV.to / Hashnode | Organic search | Architecture deep-dives |
| 8 | Product Hunt | General devs | Secondary, after HN/Reddit validation |

---

## What NOT To Do

1. **Don't launch with "universal memory layer" positioning.** Too abstract. Launch with the concrete wedge: "persistent memory for AI coding assistants." Expand after proving it.

2. **Don't build all pods before launching.** Ship coding pod. Prove it. Expand. Supabase started as "just auth + database."

3. **Don't open Discord on Day 1.** You're one person. Dead Discord > no Discord. GitHub Discussions first. Discord at ~250 users.

4. **Don't build a marketing website before the README is perfect.** README IS your landing page. Ship the site at Month 4-5.

5. **Don't chase stars with star-begging.** Stars from non-users are worthless. Focus on npm installs, search queries, issues filed.

6. **Don't compare against Mem0 on their terms** (benchmarks, enterprise, scale). Compare on yours: local-first, three-layer knowledge, document understanding, zero-install, privacy.

7. **Don't support every MCP client simultaneously.** Claude Code first, polished perfectly. Cursor/Windsurf in Month 2-3 based on demand.

8. **Don't document features that don't exist yet.** Pods get documented when pods ship.

9. **Don't do a waitlist.** Cortex is local-first open-source. No capacity constraints. Waitlists for CLI tools feel performative.

10. **Don't underestimate dogfooding content.** You use Cortex as your own memory. Share real examples: "Here's what Cortex remembered that saved me 20 minutes." Authenticity > benchmarks.

---

## Risks & Mitigations

| Risk | Level | Mitigation |
|------|-------|------------|
| Anthropic's native memory gets too good | MEDIUM-HIGH | Position as knowledge layer beneath auto-memory. Emphasize multi-tool compatibility, data sovereignty, document understanding |
| Mem0 unpaywalls graph features / adds local mode | MEDIUM | Three-layer architecture + AUDM + pods/synapses is deeper |
| "Good enough" simple MCP memory tools win on friction | MEDIUM | Win on quality of recall. Depth is hard to replicate |
| Long context windows reduce RAG demand | LOW-MEDIUM | Expensive ($1.25/query at 500K tokens), slow, "lost in the middle" problem persists |
| No published benchmarks | LOW-MEDIUM | Run LongMemEval, publish honest results. Even 70%+ beats Mem0's 49% |

---

## The Obsidian Playbook

Obsidian reached **$25M ARR and $350M valuation with 7 people** by:

1. Free core product, deeply loved by developers
2. Privacy-first, local-first architecture
3. Paid cloud services (Sync, Publish) for real pain points
4. Plugin ecosystem creating switching costs
5. Community-driven growth, zero marketing spend

Cortex follows this exact playbook with a more AI-native architecture and the pods/synapses concept that Obsidian doesn't have.

**The strategic sequence:**

```
Month 1:   Ship wedge (coding memory) → Show HN → npm publish
Month 2-3: Feedback loop → Fix everything → Product Hunt → 200 stars
Month 4-5: Agents pod + synapses → Mini Launch Week → 500 stars
Month 6-7: Personal pod → v1.0 → Full launch → 1,000 stars
Month 8-10: Work pod + connectors → Team features → Monetization
Month 10-12: Multiplayer → Cortex Cloud → $5K MRR target
```

**One sentence:** Nail one use case. Earn trust through craft. Expand through pods.
