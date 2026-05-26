# Sigil on LongMemEval, benchmark results

**Headline:** Sigil retrieval hits **R@10 = 100%** on LongMemEval (oracle split, n=100) with the OpenAI top-quality stack. Numbers verified twice, once at v0.9.x (originally branded "Cortex") and again at **v0.10.0** after the pod-distinction-layer refactor.

## TL;DR

- **Retrieval (R@1 / R@3 / R@10): 100% / 100% / 100%** on n=100, oracle split. **Flat across v0.9.x → v0.10.0.**
- **Answer correctness (LLM-judged): 43%** at v0.10.0 (41% at v0.9.x, within-variance flat). Bottlenecked by the synthesizer's temporal-reasoning, not Sigil's retrieval.
- **Cost: $0.21**, **wall time: ~37 min** for the full 100-question run at v0.10.0.
- **Headline finding:** when Sigil retrieves at top-1 reliably (which it does), the remaining quality is a function of the LLM doing the *answer composition*, not Sigil doing the *memory lookup*.
- **0.10.0 regression check:** the pod kind registry + kind-driven hot-context + pod-aware search + bi-temporal foundation columns landing in v0.10.0 preserved retrieval quality exactly. Same harness, same dataset, same stack.

## What this benchmarks

LongMemEval is the [HuggingFace dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned) used by published memory systems (Ogham, Mem0, Letta) to measure long-conversation recall. It has 500 questions across 6 categories spanning multiple sessions per question, asking the system to recall facts that may span sessions, contradict prior facts, or require temporal reasoning.

This run uses the **`longmemeval_oracle`** split, the curated, denoised version. The harder splits (`s_cleaned`, `m_cleaned`) include distractor sessions and would produce lower numbers. Results below should be read in that context.

## Configuration

```
LLM_PROVIDER=openai
LLM_OPENAI_MODEL=gpt-4o
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIMENSIONS=1024              # truncated from native 3072d
SIGIL_SYNTHESIZE=true                  # read-time synthesis enabled
SIGIL_EAGER_EXTRACT=false              # lazy/Ogham mode, chunks only, no fact extraction at write time
```

Sigil schema is at vector(1024) with halfvec-compressed HNSW indexes.

The harness ingests each question's `haystack_sessions` into a per-question namespace (`lme-<question_id>`), Ogham's per-question profile isolation pattern. Each retrieval is scoped to ~3 sessions / ~25 chunks per namespace.

## Per-question-type breakdown (v0.10.0)

The n=100 sample is biased toward the hardest categories, 60% temporal-reasoning (compare dates across sessions, "which came first") and 40% multi-session (combine info across multiple conversations). These are the categories where every published memory system loses points.

| Question type | n | R@1 | R@3 | R@10 | Answer correctness (v0.10.0) | (v0.9.x) |
|---|---:|---:|---:|---:|---:|---:|
| Temporal-reasoning | 60 | 100% | 100% | 100% | **45%** | 45% |
| Multi-session | 40 | 100% | 100% | 100% | **40%** | 35% |
| **Total (n=100)** | **100** | **100%** | **100%** | **100%** | **43%** | 41% |

The +5pp on multi-session and +2pp aggregate are well within variance at n=100 (binomial 95% CI is roughly ±10pp). The honest read is **flat answer correctness, no regression**.

## Why the answer-correctness number is what it is

This is the honest part. R@10 = 100% means Sigil retrieved the right session(s) every time. Correctness = 43% means the synthesizer (gpt-4o) composed the right answer 43% of the time *given* the right context.

The failure mode for the wrong answers:

| Failure mode | v0.10.0 | v0.9.x |
|---|---:|---:|
| Synthesizer answered wrong (composition error) | 51 | 53 |
| Synthesizer refused ("Not in retrieved memory") despite right context | 6 | 6 |

The composition errors are temporal-reasoning specifically, gpt-4o reading "I bought the Dell on Jan 28th, the Galaxy on Feb 3rd" and answering *"You got the Dell first"* when the question was *"which device did I get first?"* and the gold answer was *Samsung Galaxy* (because the user pre-ordered the Dell on Jan 28th but received it Feb 25th, after the Galaxy's Feb 3rd delivery). These are LLM reasoning errors, not retrieval errors.

## Comparison to published numbers (with honest caveats)

| System | LongMemEval R@10 | Notes |
|---|---:|---|
| **Sigil v0.10.0** | **100%** | n=100, oracle split, gpt-4o + text-embedding-3-large@1024d |
| **Sigil v0.9.x (was: "Cortex")** | **100%** | same config, prior release |
| Ogham (published) | 97.2% | Likely ran on harder split; their docs are unclear |
| Naive RAG baseline (vector-only) | 60-75% | Floor, what you get without hybrid + reranking |
| GPT-4 with full context | ~85-90% | The "throw everything at the model" baseline |

Caveats stacked on the Sigil number:
1. **Oracle is the easy split.** Adding distractor sessions (`s_cleaned`) typically drops R@10 by 3-8 points.
2. **n=100 is small.** Variance at this sample size is real.
3. **Per-question haystack is tiny (~25 chunks).** Real Sigil use is against thousands of chunks. The scaling characteristics aren't probed by this benchmark.
4. **The retrieval stack here is largely the embedding model's win.** Any decent hybrid-search system (vector + keyword + RRF) on `text-embedding-3-large` would land near 100% on oracle. Sigil's specific architectural work, lifecycle table, ACT-R activation, Hebbian co-retrieval edges, kind-driven hot-context, doesn't meaningfully exercise at this scale; it pays off at 10K+ chunks with realistic access patterns.

## What we DID NOT measure

- **Harder splits** (`s_cleaned`, `m_cleaned`). Same harness, different dataset file; ~$0.30 for 100 questions. To-do.
- **Scale.** All 500 questions, larger haystacks. Future work.
- **Other use cases.** This benchmark measures direct Q&A. Sigil's primary use is hook-based context injection into Claude Code sessions, that's a different metric (does Claude answer correctly given Sigil's injected context?) which we haven't formally measured.
- **Pod-aware retrieval specifically.** v0.10.0 ships `podScope: 'auto' | 'global' | string[]` on `search()`, and a kind-driven hot-context blend. The LongMemEval harness uses per-question namespace isolation and doesn't pass `podScope`, so the v0.10.0 numbers above confirm the pod-distinction layer **doesn't regress** the existing namespace-scoped retrieval path, but they don't independently exercise the new pod-aware code. A pod-scope-specific benchmark is future work.
- **Other systems on the same harness.** A head-to-head with Mem0, Letta, Zep on identical methodology would be more meaningful than comparing published numbers.

## Reproduction

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Run the eval, uses a separate /tmp DB so it doesn't touch your main Sigil
mkdir -p /tmp/sigil-bench-db
EMBEDDING_DIMENSIONS=1024 SIGIL_PGLITE_PATH=/tmp/sigil-bench-db \
  node src/cli.js migrate

LLM_PROVIDER=openai \
LLM_OPENAI_MODEL=gpt-4o \
EMBEDDING_PROVIDER=openai \
EMBEDDING_MODEL=text-embedding-3-large \
EMBEDDING_DIMENSIONS=1024 \
SIGIL_SYNTHESIZE=true \
SIGIL_EAGER_EXTRACT=false \
SIGIL_PGLITE_PATH=/tmp/sigil-bench-db \
  node eval/longmemeval/run-eval.js --n=100 --judge=true
```

The harness, dataset loader, and scoring code are in `eval/longmemeval/`, open for review and re-runs.

## What this report claims

- Sigil retrieval is **top-tier on LongMemEval oracle.** The R@10 number is real, the methodology is reproducible, the config is documented, and **the v0.10.0 refactor preserved it exactly.**
- Sigil retrieval **matches or exceeds** Ogham's published 97.2%, with the caveat that splits and sample sizes may differ.
- Sigil is **not yet proven at scale or on harder splits.** Those are next steps.

## What this report does NOT claim

- "Best memory system in the industry", that would require head-to-head on identical methodology against Mem0/Letta/Zep, on harder splits, at scale. We don't have any of that yet.
- Answer-correctness leadership, the 43% number is bottlenecked by gpt-4o's reasoning ability on temporal questions, not Sigil. Better synthesizer prompts (chain-of-thought, explicit date extraction) would lift this; that's separate work.
- A win for v0.10.0's specific architectural changes, the pod kind registry, kind-driven hot-context, and pod-aware search are not separately exercised by this benchmark. The point of this run was to confirm **no regression** before tagging the release.

## Run metadata

- **v0.10.0 run:** 2026-05-14 · [commit `a1c68f2`](https://github.com/Anmol-Srv/cortex/tree/master) · report: `reports/lme-n100-0.10.0.json` · n=100, cost $0.21, wall time 2197s.
- **v0.9.x run (originally branded "Cortex"):** 2026-04-29 / 2026-05-03 (v1 / v2 prompt iteration) · commit `f84cc69` on `improvements` · reports: `reports/lme-n100-2026-04-29.json` (v1), `reports/lme-n100-v2.json` (v2).
