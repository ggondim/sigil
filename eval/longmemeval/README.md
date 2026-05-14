# LongMemEval harness for Sigil

Reproducible benchmark methodology. See [`RESULTS.md`](./RESULTS.md) for the latest published numbers.

## Setup

The dataset is gitignored (15MB). Download once:

```bash
curl -L -o longmemeval_oracle.json \
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json"
```

Alternative splits (harder, with distractor sessions):
```bash
# longmemeval_s_cleaned.json  — 30MB, includes noise sessions
# longmemeval_m_cleaned.json  — 2.7GB, full dataset

curl -L -o longmemeval_s_cleaned.json \
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json"
```

## Run the eval

```bash
# Use a separate DB so the eval doesn't touch your main Sigil
mkdir -p /tmp/sigil-bench-db
EMBEDDING_DIMENSIONS=1024 SIGIL_PGLITE_PATH=/tmp/sigil-bench-db \
  node ../../src/cli.js migrate

LLM_PROVIDER=openai \
LLM_OPENAI_MODEL=gpt-4o \
EMBEDDING_PROVIDER=openai \
EMBEDDING_MODEL=text-embedding-3-large \
EMBEDDING_DIMENSIONS=1024 \
SIGIL_SYNTHESIZE=true \
SIGIL_EAGER_EXTRACT=false \
SIGIL_PGLITE_PATH=/tmp/sigil-bench-db \
  node run-eval.js --n=100 --judge=true
```

Outputs land in `reports/` (gitignored). Each report is a JSON file with per-question
recall, synthesized answer, judge verdict, latency, cost.

## Methodology

- **Per-question namespace isolation** (Ogham's pattern). Each LongMemEval question gets
  its own namespace `lme-<question_id>` so retrieval is scoped to that question's
  haystack — no cross-question pollution.
- **Hit definition.** A query "hits" if any retrieved fact/chunk's `source_document_ids`
  includes a doc derived from a session in the gold `answer_session_ids`. Document-level
  match, not chunk-level.
- **Judge.** LLM-as-judge using the same model as the synthesizer. Prompt: "Is the
  predicted answer substantively correct vs the gold? Wording can differ; the factual
  content must match."

See `RESULTS.md` for the latest run's numbers and caveats.
