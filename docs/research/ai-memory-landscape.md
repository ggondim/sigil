# The AI Memory Landscape — Research Report

*Deep-research report. Compiled 2026-06-05. Tailored for positioning **Sigil** — a local-first, cross-agent, cross-device shared-brain agent memory system with bi-temporal recall of full reasoning paths.*

> **How to read this.** Every claim below was adversarially fact-checked (3-vote, needs 2/3 to kill a claim). Out of 118 extracted claims and 25 verified, **9 survived and 16 were killed.** The killed claims matter as much as the survivors — several widely-repeated vendor benchmark numbers (especially Zep's) did **not** survive verification. Those are flagged in §6 so you don't build strategy on marketing math.

---

## 0. The one-paragraph thesis

AI memory has hit an inflection point: **the hard problem is no longer storage, it's retrieval quality under contradiction and time.** Production systems are overwhelmingly single-agent and session-scoped. The academic frontier is bi-temporal knowledge graphs (Zep/Graphiti) and decentralized CRDT sync (SHIMI) — but each solves only *one* of the two hard problems Sigil targets simultaneously: (a) accurate retrieval when facts contradict over time, and (b) shared memory across agent and device boundaries with provenance and access control. Nobody has shipped both together. That intersection is Sigil's white space — but bi-temporal storage alone is now **table stakes**, not a moat.

---

## 1. The academic frame: three memory tiers

**[HIGH CONFIDENCE]** Modern AI-memory research consistently partitions memory into three tiers:

| Tier | What it is | Core failure mode |
|---|---|---|
| **Parametric** | Knowledge frozen in model weights | Catastrophic forgetting; factual hallucination from probabilistic encoding; **information lag** — cannot perceive anything past the training cutoff without costly retraining |
| **Working / context** | The context window | Ephemeral; lost at session end |
| **Explicit / external** | Non-parametric RAG-style stores | Large-scale **retrieval efficiency & accuracy** challenges |

*Sources: arXiv [2512.23343](https://arxiv.org/html/2512.23343v1) "AI Meets Brain: Memory Systems from Cognitive Neuroscience to Autonomous Agents" (Dec 2025); arXiv [2411.00489](https://arxiv.org/abs/2411.00489) "Human-inspired Perspectives: A Survey on AI Long-term Memory" (Nov 2024). Two independent surveys name the same three failure modes. Vote: 2-1 and 3-0.*

**Why this matters for Sigil:** Sigil lives entirely in the third tier (explicit external memory), which is precisely where the unsolved problems are. Parametric approaches (fine-tune-per-user) are a dead end for personal memory at scale — but note the caveat in §6: the *strong* form of "fine-tuning is not scalable" did **not** pass verification.

---

## 2. The dominant bottleneck is retrieval, not storage

**[HIGH CONFIDENCE]** This is the single most important finding in the report.

- Retrieval **method** accounts for a ~**20-point accuracy gap (57–77%)**.
- Write/storage **strategy** moves accuracy only **3–8 points**.
- Retrieval failure is the **dominant error mode: 11–46% of all failures.**
- Retrieval precision correlates with downstream accuracy at **r = 0.98.**

*Sources: arXiv [2603.07670](https://arxiv.org/html/2603.07670v1) §5.5; arXiv [2603.02473](https://arxiv.org/abs/2603.02473v2) "Diagnosing Retrieval vs. Utilization Bottlenecks." Two independent March 2026 papers converge. Vote: 2-1, corroborator unanimous.*

**Implication:** Effort spent on clever ingestion/extraction has sharply diminishing returns versus effort spent on retrieval ranking. Whoever has the best *retrieval* wins — not whoever stores the most.

---

## 3. Memory systems hallucinate — and the errors compound

**[HIGH CONFIDENCE]** Memory pipelines don't just *pass through* hallucinations; they **manufacture and accumulate** them during extraction and update, then propagate them downstream to QA.

Four empirically-measured failure modes (the **HaluMem taxonomy**): **fabrication, errors, conflicts, omissions.**

Measured on ~15k memory points / 3.5k questions across production systems including Mem0:
- Extraction recall **< 60%** on all systems — **Mem0 collapses to 3.23%** on long contexts.
- Memory-update accuracy stays **< 50%**.
- Downstream QA accuracy tops out at **56%.**

*Source: arXiv [2511.03506](https://arxiv.org/abs/2511.03506) "HaluMem" (Nov 2025, rev. Jan 2026, under ACL ARR 2026 review). Vote: 3-0 on propagation, 2-1 on the four-type taxonomy.*

**Implication for Sigil:** A contradiction-detection / invalidation layer isn't a nice-to-have — it's the thing standing between a memory store and silent corruption. This is the strongest *technical* argument for bi-temporal design.

---

## 4. The current frontier: bi-temporal graphs + decentralized sync

### 4.1 Zep / Graphiti — bi-temporal knowledge graph (the system to beat)

**[HIGH CONFIDENCE]** Graphiti tracks **four timestamps per edge**:
- `t'_created`, `t'_expired` on the **transactional** timeline (when the system learned/unlearned it)
- `t_valid`, `t_invalid` on the **event** timeline (when the fact was actually true in the world)

This enables **automatic invalidation of prior facts when a contradiction is detected** via LLM-assisted reconciliation. It is the **most mature production bi-temporal agent memory** as of early 2026, now spun out as open source (`getzep/graphiti`).

*Source: arXiv [2501.13956](https://arxiv.org/html/2501.13956v1) (Jan 2025), corroborated by Neo4j blog + GitHub. Vote: 3-0 on architecture.*

⚠️ **But:** every *quantitative performance* claim about Zep (94.8% DMR, LongMemEval %, "90% latency reduction") was **killed 0-3** in verification — see §6. Graphiti's *architecture* is real and strong; its *benchmark superiority* is unproven from primary sources.

### 4.2 SHIMI — decentralized multi-agent sync (the only one of its kind)

**[MEDIUM CONFIDENCE]** SHIMI is the **only published system natively designed for decentralized multi-agent memory synchronization.** Agents keep local semantic memory trees and sync asynchronously via **CRDT-style merge** (commutative, idempotent, associative), achieving **>91% bandwidth reduction** vs. full-state sync at 3 nodes, sustained **>90% at 3–6 nodes.**

*Source: arXiv [2504.06135](https://arxiv.org/pdf/2504.06135) "Decentralizing AI Memory: SHIMI" (Apr 2025). Vote: 3-0 on architecture & bandwidth. **Caveat:** single-author preprint, simulated (not real-world) benchmarks; its retrieval-accuracy claims were partially killed (1-2).*

**The key structural observation:** Zep solves temporal correctness but is single-user cloud SaaS. SHIMI solves decentralized sync but is a research prototype with a semantic-tree (not bi-temporal) model. **No published system does both.**

---

## 5. Why the "LLM wiki / second-brain" approach breaks across agents & devices

**[MEDIUM CONFIDENCE — synthesized from confirmed sub-claims]**

The popular pattern — flat key-value stores, per-session context stuffing, or hand-curated markdown "second brains" (the Karpathy-style approach now common in Open Claw / Hermes practitioner setups) — breaks down for three structural reasons:

1. **No temporal invalidation.** Stale facts silently coexist with current ones; there's no `t_invalid`. (Follows from the retrieval-quality bottleneck, §2.)
2. **Hallucinations accumulate.** Without a contradiction-detection layer, fabrications/errors/conflicts compound at every write. (Follows from HaluMem, §3.)
3. **No cross-agent sync protocol.** Each agent independently re-derives shared knowledge; markdown files don't merge across devices without conflict. (Follows from SHIMI being the *only* decentralized design, §4.2.)

*Sources: synthesized from [2603.07670](https://arxiv.org/html/2603.07670v1), [2511.03506](https://arxiv.org/abs/2511.03506), [2504.06135](https://arxiv.org/pdf/2504.06135). Practitioner corroboration: ["From Second Brain to Shared Brain"](https://blog.boxcars.ai/p/from-second-brain-to-shared-brain), ["The Scaling Wall: Moving Beyond .md Files in Multi-Agent Systems"](https://volodymyrpavlyshyn.medium.com/the-scaling-wall-moving-beyond-md-files-in-multi-agent-systems-da413f9d33e3), ["The AI Memory Problem: OpenClaw, Hermes, and the Karpathy approach that survives"](https://petralian.com/posts/the-ai-memory-problem-openclaw-hermes-karpathy-approach-that-survives).*

**Nuance (important):** The framing "cross-agent sharing is *categorically unsolved*" was **refuted 0-3** (§6). The accurate statement is narrower and stronger for Sigil: systems today collapse to one of two failure extremes — **share everything (leaks private info)** or **isolate fully (no knowledge transfer)**. Nobody does *selective, provenance-aware, temporally-correct* sharing. That specific intersection is the real gap.

---

## 6. What did NOT survive verification (read this before citing anything)

The adversarial pass killed 16 claims. The patterns matter:

- **Zep's marketing numbers are not reliably sourced.** "94.8% DMR vs MemGPT 93.4%," "63.8–71.2% on LongMemEval," "90% latency reduction," "18.5% accuracy improvement" — **all killed 0-3.** Treat any Zep head-to-head benchmark with skepticism.
- **"Cross-agent memory sharing is largely unsolved"** — killed 0-3. Some systems *do* share memory. The gap is specifically *correct + access-controlled + temporally-valid* sharing.
- **"Current AI memory operates in total isolation per system"** — killed 0-3. Overstated.
- **"Cloud memory is a security necessity to avoid centralized poisoning attack surfaces"** — killed 0-3. Local-first is a privacy/UX argument, **not** a proven security necessity. Don't oversell it.
- **"Collaborative memory cuts redundant retrieval by 61%"** and **"two-tier private/shared with immutable provenance is *sufficient* for access control"** — both killed 0-3. The access-control problem is genuinely open.
- **Human episodic/semantic → AI subsystem mappings** — killed 1-2. Useful *rhetorical framing*, not validated equivalence. Use as narrative, not as technical claim.
- **"Parametric fine-tuning for memory is not scalable"** — killed 1-2. Plausible but not established.

*Full refuted list with votes and sources is in the appendix of the source JSON.*

---

## 7. Production system reality check

⚠️ **Caveat:** Internal memory behavior of **Claude Code, OpenAI Codex, Open Claw, and Hermes could not be verified from primary technical sources** — characterizations rely on public docs and secondary blogs. Vendor-landscape sources ([agentmarketcap](https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem), [atlan](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/), [Mem0 state-of-2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)) are blog-quality, not peer-reviewed.

General picture (lower confidence): the field is **single-agent and session-scoped by default.** Letta/MemGPT pioneered OS-style paged memory; Mem0 popularized extract-and-store fact memory (but scores poorly on HaluMem long-context recall, §3); Zep/Graphiti leads on temporal graphs; LangGraph/LangMem offers memory primitives inside an orchestration framework; ChatGPT memory is a closed per-user fact store. **None of these are designed local-first, and none target cross-agent + cross-device as a first-class goal.**

---

## 8. Open questions worth resolving next

1. **Sigil's empirical retrieval quality** (precision@K, recall) on a standard benchmark (LongMemEval, MemoryOS) vs. Zep/Graphiti on *temporal contradiction handling specifically*. Without this number, §2 says you can't claim leadership.
2. **Does reasoning-path recall measurably reduce hallucination?** Quantify whether storing full reasoning chains (Sigil's differentiator) lowers downstream error vs. fact-only storage.
3. **The right access-control model** for cross-agent shared memory under asymmetric permissions — the genuinely unsolved problem (§6).
4. **Does CRDT sync (SHIMI-style) translate to bi-temporal fact storage,** or does temporal conflict resolution need a heavier protocol than semantic-tree merging?

---

## Sources

**Primary (peer-reviewed or arXiv technical papers):**
- [2512.23343](https://arxiv.org/html/2512.23343v1) — AI Meets Brain: Memory Systems from Cognitive Neuroscience to Autonomous Agents
- [2411.00489](https://arxiv.org/abs/2411.00489) — Human-inspired Perspectives: A Survey on AI Long-term Memory
- [2603.07670](https://arxiv.org/html/2603.07670v1) — Agent memory benchmark synthesis (retrieval bottleneck)
- [2603.02473](https://arxiv.org/abs/2603.02473v2) — Diagnosing Retrieval vs. Utilization Bottlenecks
- [2511.03506](https://arxiv.org/abs/2511.03506) — HaluMem: hallucination in memory systems
- [2501.13956](https://arxiv.org/html/2501.13956v1) — Zep / Graphiti bi-temporal knowledge graph
- [2504.06135](https://arxiv.org/pdf/2504.06135) — SHIMI: decentralized multi-agent memory sync
- [2505.18279](https://arxiv.org/html/2505.18279v1) — Collaborative / shared memory & access control
- [2504.15965](https://arxiv.org/html/2504.15965v2), [2603.02240](https://arxiv.org/pdf/2603.02240), [2512.12856](https://arxiv.org/pdf/2512.12856), [2601.11653](https://arxiv.org/html/2601.11653v1), [2512.24848](https://arxiv.org/pdf/2512.24848)

**Secondary (blog-quality — treat as directional):** agentmarketcap, hermesos.cloud, vectorize.io, atlan, tokenmix, mem0.ai, boxcars.ai, limitededitionjonathan (substack), petralian, matrixorigin, volodymyrpavlyshyn (medium).

---

*Report stats: 5 angles · 26 sources fetched · 118 claims extracted · 25 verified · 9 confirmed · 16 killed · 108 agents. See `sigil-positioning.md` for the strategy that follows from this.*
