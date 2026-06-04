# Sigil — Market Positioning & Strategy

*Strategy doc derived from `ai-memory-landscape.md` (2026-06-05). This turns the research into a focused plan: where the white space actually is, what to build, and the wedge to win.*

---

## 1. The market in one picture

Two hard problems define the frontier of agent memory. **Each existing system solves at most one.**

```
                  TEMPORAL CORRECTNESS  →
                  (handles contradictory facts over time)
                  low                         high
   CROSS-AGENT  ┌───────────────────┬───────────────────┐
   + DEVICE     │  Markdown / LLM   │   Zep / Graphiti   │
   SYNC         │  wikis, Mem0,     │   (bi-temporal,    │
      high      │  ChatGPT memory   │   BUT single-user  │
                │  (break on sync)  │   cloud SaaS)      │
                ├───────────────────┼───────────────────┤
      ...       │                   │   SHIMI (CRDT      │
   (research)   │                   │   sync, BUT no     │
                │                   │   bi-temporal)     │
   low          └───────────────────┴───────────────────┘

        ★ SIGIL targets the empty top-right-AND-sync cell:
          bi-temporal correctness + cross-agent/device sync,
          local-first. No shipped system occupies it.
```

- **Zep/Graphiti** = best temporal correctness, but **single-user cloud**, no cross-agent/device design.
- **SHIMI** = only decentralized multi-agent sync, but **research prototype**, semantic-tree (not bi-temporal), simulated benchmarks.
- **Mem0 / ChatGPT memory / markdown wikis** = easy to adopt, but no temporal invalidation and **collapse across devices/agents.**

**Sigil is the only design aiming at the intersection.** That's real, and the research supports it. But see §3 — part of your current pitch needs to be retired.

---

## 2. What the research VALIDATES about Sigil

| Sigil bet | Research backing | Confidence |
|---|---|---|
| **Retrieval quality is the battleground** | Retrieval method = 20-pt accuracy swing; r=0.98 with downstream accuracy (§2 report) | HIGH |
| **Bi-temporal invalidation is necessary** | HaluMem shows memory pipelines manufacture & compound hallucinations; <50% update accuracy (§3) | HIGH |
| **Cross-agent + cross-device is genuinely open** | SHIMI is the *only* decentralized design; everyone else isolates or leaks (§4.2, §5) | MEDIUM-HIGH |
| **Reasoning-path recall is unique** | Absent from *every* surveyed production system (Mem0, Zep, ChatGPT, LangGraph, MemGPT) | MEDIUM |

**Your three defensible differentiators:**
1. **Local-first** with no cloud dependency (privacy/UX, *not* security — see §3).
2. **Full reasoning-path recall** — episodic replay of *how* a conclusion was reached, not just the fact. Nobody else does this.
3. **Cross-agent + cross-device sync as a first-class goal** — vs. Zep's single-user cloud API.

---

## 3. What you must STOP claiming (the research kills these)

These will get you caught by a technical buyer or investor. Drop them:

- ❌ **"Local-first is a security necessity"** — killed 0-3. The "cloud memory = centralized poisoning attack surface" argument did not survive. **Reframe as privacy + ownership + offline + latency**, not security.
- ❌ **"Cross-agent memory sharing is unsolved"** — killed 0-3. Too broad; a sharp reviewer will name counterexamples. **Reframe:** "Today's systems collapse to *share-everything (leaks)* or *isolate-fully (no transfer)*. Sigil does *selective, provenance-aware, temporally-correct* sharing." That's defensible.
- ❌ **Leaning on bi-temporal as the headline differentiator** — Graphiti already ships four-timestamp bi-temporal invalidation. **Bi-temporal is now table stakes, not a moat.** Lead with reasoning-path + sync; treat bi-temporal as parity you've matched.
- ⚠️ **Human-memory analogies (episodic/semantic)** — killed 1-2 as validated equivalences. Fine as *narrative/marketing*, never as a technical claim.

---

## 4. The wedge — how Sigil wins

**Positioning statement:**
> *Sigil is the shared brain for your agents. One memory, correct over time, that follows you across every agent and every device — local-first, so it's yours.*

**Beachhead:** the **multi-agent power user** — the person already running Claude Code + Codex + Open Claw/Hermes and hand-syncing markdown files that break (§5). They feel the pain *today*. Land there before chasing enterprise.

**Wedge sequence:**
1. **Win on retrieval accuracy first** (it's the proven battleground, §2). Everything else is secondary if recall is mediocre.
2. **Make reasoning-path recall a visible, demoable feature** — "show me why I decided X three weeks ago" replays the chain. No competitor can answer this.
3. **Make cross-device/agent sync *just work*** — the markdown-wiki crowd's #1 unmet need. This is the emotional hook.
4. **Bi-temporal correctness as the quiet quality layer** — don't headline it, but use it to never surface a stale fact.

---

## 5. Priorities — what to build/measure next (ranked)

> Ordered by leverage. The first two are gating: without them the positioning is unprovable.

1. **🔴 Benchmark retrieval quality publicly.** Run Sigil on **LongMemEval / MemoryOS / HaluMem**. Get a precision@K and a temporal-contradiction-handling number vs. Zep/Graphiti. *Without this you cannot claim leadership on the one axis that matters (§2).* This is the single highest-leverage thing you can do.
2. **🔴 Quantify the reasoning-path advantage.** Show empirically that storing full reasoning chains **reduces downstream hallucination** vs. fact-only storage. If true, this is your headline and it's unique. If not, demote it to a UX feature.
3. **🟠 Solve selective cross-agent access control.** The genuinely open problem (§3, §6 of report). A working model for *asymmetric-permission* sharing — without collapsing to all-or-nothing — would be a defensible moat the research says nobody has.
4. **🟠 Validate the sync model.** Decide whether SHIMI-style CRDT merge translates to bi-temporal fact storage, or whether temporal conflict resolution needs a heavier protocol. De-risk before scaling multi-device.
5. **🟡 Harden the write path against HaluMem failure modes.** Instrument fabrication/error/conflict/omission rates on Sigil's own extraction+update. Mem0 collapses to 3.23% recall on long context — beating that on a public benchmark is a concrete, citable win.
6. **🟡 Tighten the narrative** per §3 — rewrite the security claim, the "unsolved" claim, and demote bi-temporal to parity.

---

## 6. Competitive cheat-sheet

| System | Strength | Weakness Sigil exploits |
|---|---|---|
| **Zep / Graphiti** | Bi-temporal graph, most mature | Single-user **cloud** SaaS; no cross-agent/device; **benchmark claims unverified** (§6 report) |
| **SHIMI** | Only decentralized CRDT sync | Research prototype; **not bi-temporal**; simulated benchmarks |
| **Mem0** | Easy fact memory, popular | **3.23% recall on long context** (HaluMem); no temporal invalidation |
| **ChatGPT memory** | Frictionless, huge distribution | Closed, per-user, single-vendor, no reasoning paths, no cross-agent |
| **LangGraph / LangMem** | Primitives inside an orchestrator | Not a standalone shared brain; framework lock-in |
| **Markdown / LLM wikis** | Zero-setup, transparent | Breaks across devices/agents; no invalidation; hallucinations compound |

**The line that captures it:** *Zep made memory correct. SHIMI made it shared. Sigil is making it correct AND shared AND yours — and proving it on the only metric that matters: retrieval accuracy.*

---

## 7. The honest risk register

- **Bi-temporal is no longer differentiating.** If marketing leans on it, a technical buyer shrugs. Mitigation: §3 + §4.
- **No public benchmark yet.** Your biggest claims are currently unprovable. Mitigation: priority #1.
- **Access control is unsolved by *everyone*** — including you. It's an opportunity, but don't promise it before it works.
- **Incumbent distribution.** ChatGPT/Claude memory ship to millions by default. Sigil wins on *cross-vendor neutrality* (the shared brain *between* them) — never try to out-distribute them, out-*neutral* them.

---

*Derived from the verified findings in `ai-memory-landscape.md`. Re-run the deep-research workflow when you have public benchmark numbers — that's the input that unlocks the leadership claim.*
