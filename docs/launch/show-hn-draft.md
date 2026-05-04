# Show HN draft

## Title (80 char limit, currently 76)

> Show HN: Cortex – local-first persistent memory for Claude Code (R@10 100%)

## Body

A few weeks ago I got tired of re-explaining my codebase to Claude Code at the start of every session. Tabs full of half-remembered context, and Claude making the same mistake I corrected last week. So I built Cortex.

Cortex is a thin local layer that gives Claude Code persistent memory across sessions. It plugs in via Claude Code's UserPromptSubmit hook (auto-injecting relevant facts before every prompt) and the PostToolUse hook (silently capturing decisions and edits worth remembering). MCP tools are exposed for direct agent control. Two commands to install:

```
npm install -g @anmolsrv/cortex
cortex init
```

The default config is fully local and free — embedded PGlite database, Ollama for embeddings, your Claude Code subscription for the LLM. No cloud, no API key required to start. Voyage and OpenAI are supported as paid upgrades for top-tier quality.

Some things I tried to do well:

- **Three-layer knowledge model**, not a flat vector store. Chunks (raw text + embeddings) → atomic facts (LLM-extracted statements with confidence/importance/temporal validity, deduplicated against existing memory via an Add/Update/Delete/Merge pipeline) → entity graph (typed nodes + relations + Hebbian co-retrieval edges).

- **Single-SQL hybrid retrieval.** Vector + keyword fused via Reciprocal Rank Fusion in one Postgres CTE, then re-weighted by ACT-R-style activation (frequency × recency, softplus-bounded) × importance × confidence. Inspired by the Ogham architecture.

- **Lazy mode for Ogham-style retrieval.** Skip eager fact extraction at write time; let the synthesizer compose answers from raw chunks at read time. ~17× cheaper writes; useful for high-volume ingest.

- **Honest benchmarking.** I measured against LongMemEval oracle (the standard memory-system benchmark) and hit **R@10 = 100% on n=100, $0.22 per run** on the OpenAI text-embedding-3-large + gpt-4o stack. Methodology + caveats + per-question-type breakdown in [RESULTS.md](https://github.com/Anmol-Srv/cortex/blob/master/eval/longmemeval/RESULTS.md). Caveats matter — oracle is the easy split, n=100 is small, the per-question namespace isolation is a tiny haystack — and the report is explicit about all of them. Not claiming "best memory system in the industry," claiming "honest numbers, reproducible methodology, the install is two commands."

- **Composable provider stack.** Pick your LLM (Claude Code subscription / OpenAI / Anthropic / Ollama) and embedder (nomic / bge / Voyage / OpenAI text-embedding-3) independently, per-stage if you want. `cortex init` walks you through it.

What I'd love feedback on:

- The install flow. If it doesn't "just work" on your machine, that's a bug I want to fix.
- The memory model — what queries does it nail / fail on for your usage?
- Hooks vs MCP-only — does the auto-injection feel magical or intrusive?

Repo: https://github.com/Anmol-Srv/cortex

Demo (30s, no narration): [TODO: insert link to recorded demo]

---

## First-comment FAQ (post in reply to top comment after submission)

Common things people will ask, pre-answered:

**"How is this different from Mem0 / Letta / Zep?"**
Mem0 and Letta are SDK-first, multi-tenant-shaped, default to OpenAI APIs. Zep is hosted-first. Cortex is the opposite — single-user, local-first, free by default, designed specifically for Claude Code's hook + MCP integration. Capability-wise it's roughly at parity (same building blocks: extraction, dedup, graph, synthesis); the bet is positioning, not engineering supremacy.

**"Why not just longer context windows?"**
Long context is forgetful — facts drop out of the attention span when the conversation grows. Memory is durable across sessions. Different problem, different solution.

**"What about prompt injection via captured chat content?"**
The PostToolUse hook ships with a 4-layer regex secret-mask pipeline (covers OpenAI / Anthropic / GitHub / Slack / Stripe / generic API key patterns). Captured content is also classified by an LLM that flags noise vs signal before storage. Not bulletproof — would love adversarial review.

**"Does it work without Claude Code?"**
The MCP server is generic, so technically any MCP-aware client. But the hook integration (which is what makes it feel magical) is Claude Code specific.

**"Why PGlite if it's single-process?"**
For most users (one terminal, one Claude Code session), PGlite is fine and zero-install. For power users hitting concurrency limits, `CORTEX_DB_TYPE=postgres` switches to real Postgres. Bundled-Postgres-binary is on the roadmap so the upgrade path becomes one flag, no Docker.

**"What's the per-month cost on the paid stack?"**
Roughly $0-5/month for solo dev usage on OpenAI gpt-4o-mini + text-embedding-3-large. Voyage embeddings are free up to 200M tokens/month (you won't hit that). Detailed cost breakdown in the README's Providers section.

---

## Posting checklist (Tuesday 9am Pacific)

- [ ] Demo video uploaded (Loom / YouTube / Twitter — pick one canonical link)
- [ ] RESULTS.md verified accurate against latest run
- [ ] README hero shows demo placeholder replaced with real link
- [ ] `npm install -g @anmolsrv/cortex` confirmed working on a clean machine
- [ ] First-comment FAQ ready in clipboard
- [ ] HN account has commented before (avoids "new account" downweighting)
- [ ] Cleared 4 hours after posting to engage with comments
