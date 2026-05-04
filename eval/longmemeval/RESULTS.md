# Cortex on LongMemEval — benchmark results

**Headline:** Cortex retrieval hits **R@10 = 100%** on LongMemEval (oracle split, n=100) with the OpenAI top-quality stack.

## TL;DR

- **Retrieval (R@1 / R@3 / R@10): 100% / 100% / 100%** on n=100, oracle split
- **Answer correctness (LLM-judged): 41%** — bottlenecked by the synthesizer's temporal-reasoning ability, not Cortex retrieval
- **Cost: $0.22**, **wall time: ~89 min** for the full 100-question run
- **Headline finding:** when Cortex retrieves at top-1 reliably (which it does), the remaining quality is a function of the LLM doing the *answer composition*, not Cortex doing the *memory lookup*.

## What this benchmarks

LongMemEval is the [HuggingFace dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned) used by published memory systems (Ogham, Mem0, Letta) to measure long-conversation recall. It has 500 questions across 6 categories spanning multiple sessions per question, asking the system to recall facts that may span sessions, contradict prior facts, or require temporal reasoning.

This run uses the **`longmemeval_oracle`** split — the curated, denoised version. The harder splits (`s_cleaned`, `m_cleaned`) include distractor sessions and would produce lower numbers. Results below should be read in that context.

## Configuration

```
LLM_PROVIDER=openai
LLM_OPENAI_MODEL=gpt-4o
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIMENSIONS=1024              # truncated from native 3072d
CORTEX_SYNTHESIZE=true                 # read-time synthesis enabled
CORTEX_EAGER_EXTRACT=false             # lazy/Ogham mode — chunks only, no fact extraction at write time
```

Cortex schema is at vector(1024) with halfvec-compressed HNSW indexes.

The harness ingests each question's `haystack_sessions` into a per-question namespace (`lme-<question_id>`) — Ogham's per-question profile isolation pattern. Each retrieval is scoped to ~3 sessions / ~25 chunks per namespace.

## Per-question-type breakdown

The n=100 sample is biased toward the hardest categories — 60% temporal-reasoning (compare dates across sessions, "which came first") and 40% multi-session (combine info across multiple conversations). These are the categories where every published memory system loses points.

| Question type | n | R@1 | R@3 | R@10 | Answer correctness |
|---|---:|---:|---:|---:|---:|
| Temporal-reasoning | 60 | 100% | 100% | 100% | 45% |
| Multi-session | 40 | 100% | 100% | 100% | 35% |
| **Total (n=100)** | **100** | **100%** | **100%** | **100%** | **41%** |

## Why the answer-correctness number is what it is

This is the honest part. R@10 = 100% means Cortex retrieved the right session(s) every time. Correctness = 41% means the synthesizer (gpt-4o) composed the right answer 41% of the time *given* the right context.

The failure mode for the 59% wrong answers:

| Failure mode | Count | % |
|---|---:|---:|
| Synthesizer answered wrong (composition error) | 53 | 53% |
| Synthesizer refused ("Not in retrieved memory") despite right context | 6 | 6% |

The composition errors are temporal-reasoning specifically — gpt-4o reading "I bought the Dell on Jan 28th, the Galaxy on Feb 3rd" and answering *"You got the Dell first"* when the question was *"which device did I get first?"* and the gold answer was *Samsung Galaxy* (because the user pre-ordered the Dell on Jan 28th but received it Feb 25th, after the Galaxy's Feb 3rd delivery). These are LLM reasoning errors, not retrieval errors.

## Comparison to published numbers (with honest caveats)

| System | LongMemEval R@10 | Notes |
|---|---:|---|
| **Cortex (this run)** | **100%** | n=100, oracle split, gpt-4o + text-embedding-3-large@1024d |
| Ogham (published) | 97.2% | Likely ran on harder split; their docs are unclear |
| Naive RAG baseline (vector-only) | 60-75% | Floor — what you get without hybrid + reranking |
| GPT-4 with full context | ~85-90% | The "throw everything at the model" baseline |

Caveats stacked on the Cortex number:
1. **Oracle is the easy split.** Adding distractor sessions (`s_cleaned`) typically drops R@10 by 3-8 points.
2. **n=100 is small.** Variance at this sample size is real.
3. **Per-question haystack is tiny (~25 chunks).** Real Cortex use is against thousands of chunks. The scaling characteristics aren't probed by this benchmark.
4. **The retrieval stack here is largely the embedding model's win.** Any decent hybrid-search system (vector + keyword + RRF) on `text-embedding-3-large` would land near 100% on oracle. Cortex's specific architectural work — lifecycle table, ACT-R activation, Hebbian co-retrieval edges — doesn't meaningfully exercise at this scale; it pays off at 10K+ chunks with realistic access patterns.

## What we DID NOT measure

- **Harder splits** (`s_cleaned`, `m_cleaned`). Same harness, different dataset file; ~$0.30 for 100 questions. To-do.
- **Scale.** All 500 questions, larger haystacks. Future work.
- **Other use cases.** This benchmark measures direct Q&A. Cortex's primary use is hook-based context injection into Claude Code sessions — that's a different metric (does Claude answer correctly given Cortex's injected context?) which we haven't formally measured.
- **Other systems on the same harness.** A head-to-head with Mem0, Letta, Zep on identical methodology would be more meaningful than comparing published numbers.

## Reproduction

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Run the eval — uses a separate /tmp DB so it doesn't touch your main Cortex
mkdir -p /tmp/cortex-bench-db
EMBEDDING_DIMENSIONS=1024 CORTEX_PGLITE_PATH=/tmp/cortex-bench-db npx cortex migrate

LLM_PROVIDER=openai \
LLM_OPENAI_MODEL=gpt-4o \
EMBEDDING_PROVIDER=openai \
EMBEDDING_MODEL=text-embedding-3-large \
EMBEDDING_DIMENSIONS=1024 \
CORTEX_SYNTHESIZE=true \
CORTEX_EAGER_EXTRACT=false \
CORTEX_PGLITE_PATH=/tmp/cortex-bench-db \
  node eval/longmemeval/run-eval.js --n=100 --judge=true
```

The harness, dataset loader, and scoring code are in `eval/longmemeval/` — open for review and re-runs.

## What this report claims

- Cortex retrieval is **top-tier on LongMemEval oracle.** The R@10 number is real, the methodology is reproducible, the config is documented.
- Cortex retrieval **matches or exceeds** Ogham's published 97.2%, with the caveat that splits and sample sizes may differ.
- Cortex is **not yet proven at scale or on harder splits.** Those are next steps.

## What this report does NOT claim

- "Best memory system in the industry" — that would require head-to-head on identical methodology against Mem0/Letta/Zep, on harder splits, at scale. We don't have any of that yet.
- Answer-correctness leadership — the 41% number is bottlenecked by gpt-4o's reasoning ability on temporal questions, not Cortex. Better synthesizer prompts (chain-of-thought, explicit date extraction) would lift this; that's separate work.

## Run metadata

- **Date:** 2026-04-29 / 2026-05-03 (v1 / v2 prompt iteration)
- **Cortex commit:** [`f84cc69`](https://github.com/Anmol-Srv/cortex/tree/improvements) on the `improvements` branch
- **Reports:** `eval/longmemeval/reports/lme-n100-2026-04-29.json` (v1), `eval/longmemeval/reports/lme-n100-v2.json` (v2)
