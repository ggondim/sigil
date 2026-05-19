# Memory Core Audit — 2026-05-19

## Executive Summary

Sigil's memory core is **functionally sound** but shows signs of hardcoding and missed pluggability. The AUDM pipeline is clean; fact extraction and entity resolution both have sound designs. Hebbian edges work, but config tuning is scattered. Entity merger is safe. Most red flags are **architectural debt**, not bugs.

---

## 1. Facts Pipeline (AUDM + Deduplication)

| Aspect | Status | Notes |
|--------|--------|-------|
| **AUDM logic** | ✓ Clean | Decision tree is explicit; thresholds configurable |
| **LLM decision** | ✓ Sound | Prompt loaded from `AUDM_PROMPT_PATH`; fallback parses `UPDATE`/`CONTRADICT` |
| **Retry logic** | ✓ None needed | LLM error surfaces immediately; caller retries as needed |
| **Fallback path** | ✓ Safe | If ambiguous but LLM fails, returns `ADD` (conservative) |

**Details:**

- **Thresholds**: `skipThreshold: 0.88` (skip identical), `ambiguousThreshold: 0.78` (invoke LLM). Both configured in `src/config.js`, overridable via env vars.
- **Decision parsing** (`facts/store.js:61–71`): Reads `AUDM_PROMPT_PATH`, calls `llmPrompt()`, then greedily matches `UPDATE`/`CONTRADICT` in uppercase. **Fragile**: if the model wraps the answer in explanation, the `includes()` still works, but only by accident. No JSON schema enforcement.
- **History recording** (`store.js:180–189`): Writes to `history` table on UPDATE/CONTRADICT, capturing old/new content + similarity delta. Helps audit trails.
- **Lifecycle tracking** (`store.js:191–209`): `recordAccess()` flips fact stage `stable → editing` and increments access count. Called fire-and-forget from search path. **Good design**: non-blocking, separate table to avoid HNSW index bloat.

**Weaknesses:**

- No explicit request retry (file I/O, LLM call). If `readFile(AUDM_PROMPT_PATH)` or `llmPrompt()` transient-errors, the whole ingest fails.
- LLM decision prompt is not version-controlled in schema; living in a separate markdown file makes it invisible to tests.

---

## 2. Fact Extractor

| Aspect | Status | Notes |
|--------|--------|-------|
| **Prompt clarity** | ✓ Good | Inline JSON spec, categories enumerated |
| **Error handling** | ⚠ Weak | Silently drops bad JSON; no fallback extraction |
| **Bad JSON behavior** | ⚠ No signal | `validateFacts()` returns empty array, swallows error |
| **Categories** | ✓ Pluggable? | Hardcoded in `categories.js`; would need code edit to add |

**Details:**

- **Extraction flow** (`facts/extractor.js:46–78`): Batches chunks via lodash `chunk()` (5 concurrent), calls `extractFactsFromChunk()`, which builds prompt + calls `promptJson()`.
- **Validation** (`extractor.js:35–44`): Filters on `content`, `category` membership, and confidence values. Maps `importance` to `supplementary` if missing. **Defensive**, but silently drops malformed facts.
- **Bad JSON path** (`extractor.js:69–72`): If `promptJson()` throws or returns non-array, the catch logs to console and returns `[]`. The batch continues. **Result**: lost facts with no audit signal.

**Categories** (`facts/categories.js`):
```javascript
const DEFAULT_CATEGORIES = {
  preference, opinion, personal, experience,  // personal
  business_rule, workflow, architecture, ..., action_item  // knowledge
};
```

All hardcoded. To add a custom category, you edit the source and rebuild. **Not pluggable** in runtime (no `.register()` pattern).

---

## 3. Pod Registry & Kind System

| Aspect | Status | Notes |
|--------|--------|-------|
| **Registry design** | ✓ Clean | `Map`-based, validation on register |
| **Runtime registration** | ✗ Not yet | Hard-coded registration in `kinds/index.js` |
| **0.12.0 plan readiness** | ⚠ Partial | Registry accepts dynamic kinds, but no SDK/CLI path to add them |
| **Kind extensibility** | ⚠ Manual | No way to inject kind without code edit |

**Details:**

- **Registry** (`pods/registry.js`): `Map` of kinds, `register()` validates required fields + schema. **Clean contract**.
- **Built-in kinds** (`pods/kinds/index.js:14–40`): Calls `register()` at import time for `claudeSessionKind`, `projectKind`, `personKind`, `playbookKind`, `vitalKind`. **Hard dependency**: all five are baked into startup.
- **Kind contract** (registry.js docs): Optional `resolveActiveScope()`, `lifecycle.open`, `hotContextBudget`, decay policy. All documented.
- **Active scope** (`registry.js:123–139`): Iterates kinds, calls `resolveActiveScope()`, silently swallows errors. **Safe**: a broken kind doesn't crash hot-context.

**Pluggability gap**: To add a custom kind in 0.10.0, you must:
1. Write a new kind file (e.g., `kinds/custom.js`)
2. Import + call `register()` in `kinds/index.js`
3. Rebuild

No SDK or CLI hook. The 0.12.0 plan mentions runtime SDK registration; until then, kinds are code-only.

---

## 4. Entity Resolution & Deduplication

| Aspect | Status | Notes |
|--------|--------|-------|
| **Cascade design** | ✓ Elegant | 4-stage waterfall, each with fallback |
| **Embedding match** | ✓ Sound | Threhold 0.85, LLM verifies with episode context |
| **Rename detection** | ✓ Smart | LLM sees source passage, detects "X is now Y" |
| **Merger safety** | ✓ Solid | Transaction guards FK deps; pod reassignment handles edge case |
| **Tangling** | ✓ Cleanly separated | `embedding-matcher.js` is pure, `resolver.js` is orchestration |

**Details:**

- **Stage 1** (`resolver.js:36–43`): Exact name match (incl. lowercased aliases). Fast, DB-only.
- **Stage 2** (`resolver.js:47–60`): Embedding-similar candidates (threshold 0.85). LLM verifies with `episodeText` context. **Killer feature**: rename detection ("X is now named Y") that pure cosine similarity can't see.
- **Stage 3** (`resolver.js:65–90`): If embedding stage returns nothing but other entities were mentioned in the same passage, try them as rename candidates. Covers the Smara/Sigil case.
- **Stage 4** (`resolver.js:92–99`): Create new entity. Catches race on insert (parallel ingest) and retries with find (standard pattern).

**Embedding matcher** (`embedding-matcher.js`):
- `findEmbeddingMatch()`: Returns rows, tries to parse `entity_types` JSON (fallback to `entityType`).
- `verifyEmbeddingMatch()`: Constructs rich LLM prompt with aliases, similarity %, source passage. Lenient JSON parse (tries strict, then extracts `{...}`, then falls back to text match). **Smart defensive coding**.

**Merger** (`merger.js`):
- Redirects relations (source + target). Removes self-references.
- Merges `fact_entity` via INSERT ON CONFLICT, summing mention counts.
- Sums entity mention counts.
- **Pod edge case** (`merger.js:60–72`): If both primary and duplicate have pods, archive the duplicate's pod instead of reassigning. Prevents two active pods for the same entity.
- **Type merge**: Calls `updateEntityTypes()` per-type in a loop (outside transaction). **Not ideal** (N separate writes), but safe.

---

## 5. Hebbian Learning

| Aspect | Status | Notes |
|--------|--------|-------|
| **Fact-level** | ✓ Simple, effective | Lexicographic canonicalization, O(K²) pairs |
| **Entity-level** | ✓ Tunable | Capped increment (eta, cap), lazy decay (lambda) |
| **Tuning constants** | ✓ Configurable | `config.hebbian.{fact,entity}.{eta,cap,halfLifeDays}` |
| **Dead edges** | ✓ Pruned | `consolidateCoRetrievalEdges()` cleans stale edges |
| **Complexity vs. benefit** | ⚠ Moderate | Decay formula is elegant but not strictly necessary |

**Details:**

**Fact Hebbian** (`lifecycle/hebbian.js`):
- `strengthenEdges()`: Pairs facts retrieved together, O(K²) upsert. Canonical form: `fact_a_id < fact_b_id`. ON CONFLICT increments strength.
- Used in search ranking + "related facts" UX.
- **No tuning**: Hardcoded increment of 1.

**Entity Hebbian** (`lifecycle/entity-hebbian.js`):
- `strengthenEntityEdges()`: Gated by `config.hebbian.entity.enabled`. Capped increment: `LEAST(strength + eta, cap)`.
- `getCoRetrievedEntities()`: **Decay formula**: `effective = strength * exp(-lambda * days_since_last_seen)` where `lambda = ln(2) / halfLifeDays`.
- **Lazy decay**: No background job; decay computed only on read. Keeps write path cheap.
- `getEdgeStrengthsForRanking()`: Returns summed decayed strength across seed entities. Used to boost facts whose entities co-appear with query results.

**Config knobs** (`src/config.js`):
```javascript
hebbian: {
  entity: { enabled: true, eta, cap, halfLifeDays, minEffective }
}
```

**Weak points:**

- Fact Hebbian has no config; increment is hardcoded `+ 1`.
- Decay formula assumes exponential forgetting, but no evidence this is better than linear decay or time windows.
- `getCoRetrievedEntities()` queries `entity_hebbian_edge` and throws away rows with low `effectiveStrength`. Could be more efficient.

---

## 6. Code Quality

| Area | Issues |
|------|--------|
| **Bloated comments** | ✓ None. Most comments explain WHY (eager to understand AUDM or decay). |
| **Magic numbers** | ⚠ `0.88`, `0.78` (AUDM thresholds); `0.85` (embedding threshold); `1` (fact hebbian increment) |
| **Unused functions** | ✓ None detected. Every export is imported somewhere. |
| **Repeated patterns** | ⚠ Every store module has `find*()`, `insert*()`, `update*()`, `list*()`. No base class, but consistent style. |
| **Imports** | ⚠ Some files import 3+ from same module but don't club imports (e.g., `resolver.js` imports `findByName`, `incrementMentionCount`, `updateEntityTypes` from `store.js` across lines 7–9). Minor. |

**Imports clustering** (current style):
```javascript
import { findByName, incrementMentionCount, updateEntityTypes, ... } from './store.js';
```
Already done in most files. Good.

---

## 7. Pluggability Gaps

| Subsystem | Gap | Workaround / Plan |
|-----------|-----|------------------|
| **Fact categories** | Hardcoded in `categories.js` | Add `.register()` + export registry map; update extractor to use registry |
| **Pod kinds** | Code registration only (0.10.0) | 0.12.0: SDK method to register kinds; CLI init flow to accept kind specs |
| **Hebbian tuning (fact)** | No increment config | Add `config.hebbian.fact.eta`; wire to `strengthenEdges()` |
| **AUDM prompt** | File-based, not versioned | Move to `src/prompts/audm-decision.json` with version; serialize + validate schema |

---

## 8. Concrete Recommendations

### Priority 1: AUDM Robustness

**File:** `src/memory/facts/store.js`

**Issue:** `audmDecide()` (line 61) reads file + calls LLM without retry. If either fails, fact ingest stops.

**Fix:**
```javascript
// Add retry helper
async function audmDecide(newContent, existingContent) {
  const systemPrompt = await retry(
    () => readFile(AUDM_PROMPT_PATH, 'utf8'),
    { maxAttempts: 3, delay: 100 }
  );
  const text = await retry(
    () => llmPrompt(input, { model: config.llm.decisionModel, caller: 'audm' }),
    { maxAttempts: 2, delay: 100 }
  );
  // ... rest
}
```

**Effort:** Low. Requires `retry()` helper (already in backlog, task #35).

### Priority 2: Fact Categories Registry

**File:** `src/memory/facts/categories.js`

**Issue:** Custom categories require code edit.

**Fix:**
```javascript
const categoryRegistry = new Map(Object.entries(DEFAULT_CATEGORIES));

export function registerCategory(name, description) {
  categoryRegistry.set(name, description);
}

export function getCategories() {
  return Array.from(categoryRegistry.keys());
}
```

Update `extractor.js:28` to use `getCategories()` instead of hardcoded list. **Effort:** Low. No schema changes.

### Priority 3: Fact Hebbian Tuning

**File:** `src/memory/lifecycle/hebbian.js:20–46`

**Issue:** Increment is hardcoded to 1; no config lever.

**Fix:**
```javascript
async function strengthenEdges(factIds, { eta = config.hebbian.fact?.eta ?? 1 } = {}) {
  // ... 
  await cortexDb.raw(`
    INSERT INTO hebbian_edge (...)
    VALUES ...
    ON CONFLICT (...) DO UPDATE SET
      strength = hebbian_edge.strength + ?,  // param
      last_seen_at = NOW()
  `, [...params, eta]);  // pass eta
}
```

Add to `config.js`:
```javascript
hebbian: { fact: { eta: 1 } }
```

**Effort:** Low.

### Priority 4: AUDM Prompt Versioning

**File:** `src/memory/facts/store.js:12`

**Issue:** Prompt is in a separate file, invisible to version control + schema.

**Fix:** Move prompt to JSON in `src/lib/prompts.js`:
```javascript
export const AUDM_DECISION_PROMPT_V1 = { ... };
```

Wire to a manifest so older versions are still resolvable. **Effort:** Medium. Requires careful schema design.

### Priority 5: Entity Type Update Batch

**File:** `src/memory/entities/merger.js:83–87`

**Issue:** Loop calls `updateEntityTypes()` N times (N separate DB hits).

**Fix:** Batch into a single SQL merge:
```javascript
const duplicateTypes = safeParseEntityTypes(duplicate);
if (duplicateTypes.length > 0) {
  await batchUpdateEntityTypes(primaryId, duplicateTypes);
}
```

**Effort:** Low–Medium. Requires new helper function.

---

## 9. Summary Table

| Module | Health | Risk | Debt |
|--------|--------|------|------|
| **facts/store.js** (AUDM) | ✓ Good | Low | Retry logic, versioning |
| **facts/extractor.js** | ✓ Good | Low | Custom category registry |
| **facts/categories.js** | ✓ Works | Low | Not pluggable |
| **pods/registry.js** | ✓ Excellent | None | Awaits 0.12.0 SDK |
| **pods/kinds/** | ✓ Good | Low | Hardcoded registration |
| **entities/resolver.js** | ✓ Excellent | None | None |
| **entities/embedding-matcher.js** | ✓ Excellent | None | None |
| **entities/merger.js** | ✓ Safe | None | Type merge N+1 |
| **lifecycle/hebbian.js** | ✓ Good | Low | Fact increment config |
| **lifecycle/entity-hebbian.js** | ✓ Good | Low | None |
| **documents/store.js** | ✓ Clean | None | None |
| **chunks/store.js** | ✓ Minimal | None | None |

**Overall:** No critical bugs. Architecture is sound. Main debt is **hardcoding** and **tuning visibility**.

