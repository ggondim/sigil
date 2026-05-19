# Retrieval Layer, Ingestion Pipeline, and MCP Surface Audit

**Date:** 2026-05-19  
**Scope:** `src/memory/search/`, `src/ingestion/`, `src/mcp/`  
**Baseline:** 551 lines (hybrid.js) + 202 lines (hybrid-sql.js) + 323 lines (pipeline.js) + 671 lines (9 MCP tools)

---

## 1. Hybrid Search Layer (Vector + Keyword + Activation)

### What It Does
Two-path search: entity-first (when query matches a known name) branches to alias-based multi-query search; standard path expands query variants and merges via RRF. Facts use single-query SQL RRF (hybrid-sql.js); chunks stay on two-query JS-merge path.

### Duplicate Constants Between hybrid.js ↔ hybrid-sql.js
**Critical:** RRF_K, VECTOR_WEIGHT, KEYWORD_WEIGHT defined in both files (hybrid.js:25–29, hybrid-sql.js:24–26).

| Constant | hybrid.js | hybrid-sql.js | Status |
|----------|-----------|---------------|--------|
| RRF_K | 20 | 20 | ✓ Synced |
| VECTOR_WEIGHT | 1.0 | 1.0 | ✓ Synced |
| KEYWORD_WEIGHT | 0.7 | 0.7 | ✓ Synced |

**Issue:** Duplication increases risk of drift. Values are tuning-sensitive; changing one without the other breaks ranking. No single source of truth. **Suggestion:** Export from `filters.js` (which already exports CONFIDENCE_CASE), import into both hybrid.js and hybrid-sql.js. **File:line:** `src/memory/search/filters.js:1–28` (add constants here); update imports in hybrid.js:25–29 and hybrid-sql.js:24–26.

### Dead Code Branches
**Entity-first vs. standard:** Lines 58–62 branch on `matchedEntity`. Both paths call `multiQueryMerge()` (hybrid.js:230, 340). **No dead code detected**—each branch is necessary (entity-first handles renames via alias variants).

### Synthesizer Prompt (hybrid.js:111–125)
**Assessment:** Prompt is well-engineered.
- Clear role: "answering from a personal-memory system."
- Explicit step-by-step instruction for temporal reasoning: **"Reason step-by-step internally for temporal questions ("first", "before", "after", "how many days") — compare the dates explicitly."** ✓
- Handles the flagged temporal-reasoning problem: prompt guides the synthesizer to read chunks **carefully** and **compare dates explicitly** rather than inferring time from recency.
- Chunk volume increased from 5×600 to 15×2000 chars (hybrid.js:102–105 comment) to feed temporal reasoning.
- Cites with bracket syntax; permits "Not in retrieved memory" only after careful reading.

**Quality:** 8/10. Tight, instruction-heavy, multi-signal (facts + chunks). No brittleness detected.

### Query Router (query-router.js:23–82)
**How intent is classified:**
1. Cache lookup (TtlCache 10 min, up to 200 queries).
2. LLM call via promptJson (config.llm.extractionModel) if miss.
3. Validates intent ∈ {preference, factual, entity_lookup, exploratory, temporal}.
4. Falls back to 'factual' on invalid result.

**Intent routes:**
| Intent | Categories | Expand | Graph | Limit |
|--------|-----------|--------|-------|-------|
| preference | [preference, opinion, personal] | false | false | — |
| factual | [] | false | false | — |
| entity_lookup | [] | false | **true** | — |
| exploratory | [] | **true** | **true** | 15 |
| temporal | [] | false | false | — |

**Mutually exclusive?** Yes, by design. Each intent maps to a unique (categories, expand, useGraph) tuple. Categories are disjoint (preference vs. others). **Prompt is tight** (query-router.js:30–38, ~8 lines). **Cache adds 50–100ms latency savings** on repeat queries.

### Hebbian Boost Logic (applyCoRetrievalBoost, hybrid.js:388–450)
**Complexity assessment:**
- **Line count:** ~62 lines (setup + boost + re-sort).
- **Worth it?** Moderately. Solves a real problem: facts with co-retrieved entities should rank higher. Without it, a fact about "Bob" doesn't rise when the query is about "Alice" even if Bob ↔ Alice are strongly connected.
- **Tunable?** Yes: config.hebbian.entity.rrfWeight, config.hebrian.entity.maxWriteEntities, config.hebrian.entity.expandPerSeed.
- **Duplication with lifecycle/entity-hebbian.js?** Partial. applyCoRetrievalBoost reads edge strengths from getEdgeStrengthsForRanking() (entity-hebbian.js, hybrid.js:421), which is the single source for Hebbian weights. Logic is re-derived here (boost = strength / maxBoost; newScore = rrfScore + weight × normalized boost), but **not duplicated**—the read layer and write layer are separate by design (CQRS-ish).

**Issue:** applyCoRetrievalBoost computes boost for every fact in the result set, then re-sorts (O(K²) matrix reads, but K ≤ 5 by default, so ~25 edge lookups). **Acceptable for search latency**, but worth caching edge strengths in-memory if Hebbian becomes a hot path.

## 2. Ingestion Pipeline (pipeline.js)

### 6-Stage Flow Cleanliness
```
[0] Classify (input-classifier.js) → route: thought/knowledge/noise
[1] Hash check (documents.upsert) → skip if unchanged
[2] Parse (parse()) → sections + text
[3] Chunk + contextualize + embed (chunker, contextualizer, embedder) → chunks[]
[4] Extract facts (extractFactsFromChunks) → facts[] OR skip (lazy mode)
[5] Link entities (linkDocumentEntities) → entities + relations
```

**Cleanly factored?** Yes. Each stage is delegated to a separate module. **No tangled stages detected**. Pipeline parallelizes stages [0] and [1] implicitly (hash check is synchronous; classify is async but fire-and-forget for logging).

**Pod attachment flow (pipeline.js:95–131):** Resolves pod attachments, attaches document and facts to pods in parallel. Well-designed: podAttachments are resolved once, then used to batch-attach both documents and facts.

**Minor issue:** "Thought fast-path" (pipeline.js:110–143) bypasses chunking entirely, stores facts directly with high confidence/vital importance. This is intentional (Ogham approach) but worth documenting: facts extracted by input-classifier are assumed to be distilled and high-signal.

### Pluggability: Adding a New Ingestion Source
**Current state:** resolveSource (resolve-source.js) dispatches to sources/file.js or sources/url.js. Adding a new source (e.g., S3, Slack) requires:
1. New file `src/ingestion/sources/slack.js` with `fetchSource()` export.
2. Update resolveSource() to detect and dispatch (1 line).
3. Wire into ingest.js tool schema (add `slackChannelId` param, ~2 lines).

**Files touched: 3**. Low friction. ✓

---

## 3. MCP Tools (9 Total)

| Tool | Lines | Shape | Wrappers |
|------|-------|-------|----------|
| search | 122 | ✓ Thin | 2 (LLM calls via search(); formatting) |
| search_entity | 45 | ✓ Thin | 1 (searchByName) |
| traverse_graph | 117 | ✓ Thin | 3 (getEntityNeighborhood, findPath, findRelated) |
| get_fact_context | 72 | ✓ Thin | 3 (findByUid, getEntitiesForFact, getRelationsByFact) |
| get_entity_context | 87 | ✓ Thin | 2 (getEntityContext relations) |
| get_pod | 84 | ✓ Thin | 1 (getPod) |
| list_pods | 46 | ✓ Thin | 1 (listPods) |
| ingest | 57 | ✓ Thin | 2 (resolveSource, ingestDocument) |
| status | 41 | ✓ Thin | 1 (statusSnapshot) |

**Assessment:** All 9 tools are thin wrappers. **Consistent shape:** Each registers a single tool, validates inputs via Zod, calls 1–3 internal modules, formats output via textResponse(). **Error handling:** Uniform pattern (check params, call module, return textResponse or error message).

**No bloated tools detected.** No SQL/business logic embedded in tools.

---

## 4. Pluggability Assessment

### Adding a New Search Modality
**Steps:**
1. Create `src/memory/search/fuzzy.js` with searchChunks() + searchFacts().
2. Import into hybrid.js and call in coreHybridSearch() alongside vector/keyword.
3. Add weights config (config.search.fuzzy.weight) and RRF merge (rrfMerge).

**Files touched: 3** (fuzzy.js, hybrid.js, config). **Complexity:** Moderate. ✓

### Adding a New MCP Tool
**Steps:**
1. Create `src/mcp/tools/my-tool.js` with registerMyTool(server).
2. Import and call in src/mcp/server.js (createMcpServer).
3. Add to tool-list comment in server.js.

**Files touched: 2–3**. **Complexity:** Trivial. ✓

### Adding a New Ingestion Source
**Steps:** (covered above) **Files touched: 3**. ✓

---

## 5. Code Cleanliness

### Narrative Comments
**Excessive?** No. Comments explain **why**, not **what**:
- hybrid.js:23–24 explains RRF_K tuning rationale (0.001 band compression).
- hybrid.js:64–68 justifies fire-and-forget access tracking (offline from hot path).
- hybrid-sql.js:54–78 documents parameter ordering complexity (necessary given SQL shape).

**Quality:** Good. Comments teach the reader why tradeoffs were made.

### Magic Numbers
**Found:**
| Number | Location | Context | Tunable? |
|--------|----------|---------|----------|
| 20 | RRF_K (2 places) | Rank fusion constant | Config (via filters.js proposal) |
| 1.0, 0.7 | VECTOR/KEYWORD weights (2 places) | RRF weights | Config (via filters.js proposal) |
| 60 | MAX_ENTITY_QUERY_LENGTH | Entity detection threshold | Config (via config.search.entityMaxLength) |
| 512, 50 | CHUNKER tokens (chunker.js) | Chunk size / overlap | Config (via config.ingestion.chunk*) |
| 8000 | contextualizer.js:24 | Document slice for context | Hardcoded, not configurable |
| 15 | synthesizer: chunks limit (hybrid.js:103) | Evidence chunk count | Config (via config.search.synthesizeMaxChunks) |
| 0.01 | ACT-R t_days floor (hybrid-sql.js:162) | Temporal log safety | Hardcoded, low risk |

**Issue:** 8000-char document slice in contextualizer is hardcoded. **Suggestion:** Add config.ingestion.contextualizerDocSlice = 8000. **File:line:** `src/ingestion/contextualizer.js:24`.

### Unused Exports
**Checked:** All exports are used.
- hybrid.js:551 exports {search} — used by mcp/tools/search.js, calls to search() throughout.
- hybrid-sql.js:202 exports {hybridSearchFacts} — used by hybrid.js:14, 499.
- filters.js:28 exports {CONFIDENCE_CASE, buildFactFilters} — used by vector.js, keyword.js, hybrid-sql.js.
- graph-enhancement.js:104 exports 3 functions — all used by hybrid.js.
- query-expander.js:56 exports {expandQuery} — used by hybrid.js:16, 333.

**No dead exports detected.** ✓

---

## 6. Concrete Suggestions (Priority Order)

| Priority | Issue | File:Line | Effort | Impact |
|----------|-------|-----------|--------|--------|
| **High** | RRF_K, VECTOR_WEIGHT, KEYWORD_WEIGHT duplicated across hybrid.js ↔ hybrid-sql.js | hybrid.js:25–29; hybrid-sql.js:24–26 | 5 min | Eliminates drift risk; unifies tuning. |
| **High** | 8000-char limit in contextualizer hardcoded | src/ingestion/contextualizer.js:24 | 3 min | Improves flexibility for large documents. |
| **Medium** | ACT-R activation in hybrid-sql.js may not activate on rarely-accessed facts | hybrid-sql.js:157–165 | 15 min | Review: does 0.01-day floor prevent activation collapse? |
| **Medium** | applyCoRetrievalBoost O(K²) matrix lookups on every search | hybrid.js:388–450 | 20 min | Cache edge strengths in request context. |
| **Low** | Query router fallback to 'factual' is silent | query-router.js:43–46 | 2 min | Add debug log on invalid intent. |
| **Low** | Ingest pipeline thought fast-path undocumented | pipeline.js:110–143 | 2 min | Add DESIGN.md section on fast-path semantics. |

---

## 7. Summary

**Strengths:**
- Clean architectural separation: retrieval, ingestion, and MCP layers are loosely coupled.
- All MCP tools are thin wrappers; no business logic bloat.
- Synthesizer prompt addresses temporal reasoning well.
- Ingestion pipeline is 6-stage and modular; easy to extend.
- Pluggability (new search modality, new source, new tool) is low-friction.

**Weaknesses:**
- RRF constant duplication creates drift risk.
- Hardcoded magic numbers (8000 chars, 0.01 day) reduce flexibility.
- ACT-R activation floor may suppress rarely-accessed signals.
- Hebbian boost latency not profiled (O(K²) acceptable but worth monitoring).

**Code Quality:** 8/10. No dead code, clean comments, consistent error handling. Dual-constant issue is the main technical debt.

