import { keyBy } from '../../lib/collection.js';

import { embed, embedBatch } from '../../ingestion/embedder.js';
import config from '../../config.js';
import { findByName, searchByName } from '../entities/store.js';
import { getFactsForEntity } from '../facts/entity-linker.js';
import { recordAccess } from '../facts/store.js';
import { strengthenEdges } from '../lifecycle/hebbian.js';
import { listRelationsForEntity } from '../entities/relations.js';
import * as vectorSearch from './vector.js';
import * as keywordSearch from './keyword.js';
import { hybridSearchFacts } from './hybrid-sql.js';
import { extractEntitiesFromFacts, findRelatedFacts, rerank } from './graph-enhancement.js';
import { expandQuery } from './query-expander.js';
import { routeQuery } from '../cognitive/query-router.js';
import { prompt as llmPrompt } from '../../lib/llm.js';

// K=20 gives good score spread for our result set sizes (5-50).
// K=60 (original paper) compresses scores into a ~0.001 band with small sets.
const RRF_K = 20;

// Vector results get higher weight — better for semantic/natural language queries.
const VECTOR_WEIGHT = 1.0;
const KEYWORD_WEIGHT = 0.7;

// Entity detection only for short, name-like queries — not full sentences
const MAX_ENTITY_QUERY_LENGTH = 60;

async function search(query, { namespaces, limit = 5, minConfidence = 'medium', useGraph = false, includeChunks = false, pointInTime, expand = false, route = true, categories, synthesize = config.search.synthesize } = {}) {
  // When synthesis is on, force include chunks so the synthesizer has raw material
  // (especially important in lazy/Ogham mode where no facts are stored).
  if (synthesize) includeChunks = true;

  // Cognitive routing — classify query intent and adjust search params
  let routing = null;
  if (route) {
    routing = await routeQuery(query);
    // Route decision is logged to llm_log via the router's promptJson call.
    // No console output here — search is called from MCP/hooks where stdout is protocol.

    useGraph = useGraph || routing.useGraph;
    expand = expand || routing.expand;
    limit = routing.limit || limit;
    pointInTime = pointInTime || routing.pointInTime;
    categories = categories || (routing.categories.length ? routing.categories : undefined);
  }

  const matchedEntity = await detectEntity(query, namespaces);

  let result;
  if (matchedEntity) {
    result = await entityFirstSearch(matchedEntity, query, { namespaces, limit, minConfidence, includeChunks, pointInTime, categories });
  } else {
    result = await standardSearch(query, { namespaces, limit, minConfidence, useGraph, includeChunks, pointInTime, expand, categories });
  }

  // Fire-and-forget access tracking + Hebbian co-retrieval edge strengthening.
  // Both run off the hot path (no await). Edge writes are O(K²) per query but K is
  // small (default top-5), so it's tens of upserts at most. Per Ogham §G.
  const factIds = result.facts.map((f) => f.id).filter(Boolean);
  recordAccess(factIds).catch((err) => console.error('[access-tracking]', err.message));
  strengthenEdges(factIds.slice(0, 8)).catch((err) => console.error('[hebbian]', err.message));

  // Read-time synthesis — LLM pass over retrieved evidence to compose a coherent answer.
  // The synthesizer is also the must-miss signal: it returns "Not in retrieved memory."
  // when the top-K doesn't actually contain the answer, which is more reliable than any
  // similarity threshold.
  if (synthesize) {
    try {
      result.synthesized = await synthesizeAnswer(query, result);
    } catch (err) {
      console.error('[synthesizer] failed:', err.message);
      result.synthesized = null;
    }
  }

  return result;
}

async function synthesizeAnswer(query, { facts, chunks }) {
  const evidence = [];

  facts.slice(0, 10).forEach((f, i) => {
    evidence.push(`[F${i + 1}] (${f.category}) ${f.content}`);
  });

  if (chunks.length) {
    // Up to 15 chunks at 2000 char each. Modern context windows handle this fine
    // and the prior 5×600 was starving temporal/compositional questions.
    chunks.slice(0, 15).forEach((c, i) => {
      const text = (c.content || '').replace(/\s+/g, ' ').trim();
      if (text) evidence.push(`[C${i + 1}] ${text.slice(0, 2000)}`);
    });
  }

  if (!evidence.length) return 'No retrieved evidence — nothing to synthesize.';

  const synthPrompt = `You are answering a question from a personal-memory system.
Each retrieved item is labeled [F#] (a stored fact) or [C#] (a raw conversation chunk
that may include user/assistant turns and dates).

Question: ${query}

Retrieved memory items:
${evidence.join('\n')}

Instructions:
- Read the chunks carefully — the answer is often a specific phrase or date inside one of them, not always pre-summarized as a fact.
- Reason step-by-step internally for temporal questions ("first", "before", "after", "how many days") — compare the dates explicitly.
- Cite items in square brackets where they directly support the answer, e.g. [C2].
- Only respond "Not in retrieved memory." if you genuinely cannot find the information after carefully reading every chunk. Prefer a careful answer with citation over refusal.
- Plain text only, no headers. Direct answer first, then a short justification if needed. 1-4 sentences total.`;

  const model = config.search.synthesizeModel || config.llm.extractionModel || undefined;
  return llmPrompt(synthPrompt, { model, caller: 'synthesizer' });
}

// Check if the query matches a known entity by name (DB lookup, no LLM call)
async function detectEntity(query, namespaces) {
  if (query.length < 2 || query.length > MAX_ENTITY_QUERY_LENGTH) return null;

  const ns = namespaces[0] || config.defaults.namespace;

  // Exact case-insensitive match first
  const exact = await findByName(query, ns);
  if (exact) return exact;

  // Fuzzy LIKE match — top result only
  const results = await searchByName(query, { namespace: ns, limit: 1 });
  return results[0] || null;
}

// Entity detected: fetch entity facts + relations in parallel with hybrid
// search across the canonical name + every alias, then merge.
//
// This is the bridge across renames. When the user asks "Sigil" and the
// canonical entity has aliases=["smara"], the original cosine/keyword
// search for "Sigil" can't see fact text that still says "Smara." Running
// a parallel search for each alias and merging the result sets lets those
// historical facts surface — without rewriting fact text.
async function entityFirstSearch(entity, query, { namespaces, limit, minConfidence, includeChunks, pointInTime, categories }) {
  const queryVariants = buildAliasQueryVariants(query, entity);

  const variantEmbeddings = await embedBatch(queryVariants, { inputType: 'query' });

  const [entityFacts, entityRelations, ...hybridResults] = await Promise.all([
    getFactsForEntity(entity.id, { limit }),
    listRelationsForEntity(entity.id, { limit: 15 }),
    ...queryVariants.map((q, i) => coreHybridSearch(q, {
      queryEmbedding: variantEmbeddings[i],
      namespaces, limit, minConfidence, includeChunks, pointInTime, categories,
    })),
  ]);

  // Entity-linked facts get highest priority
  const entityFactsMarked = entityFacts.map((f) => ({ ...f, source: 'entity' }));

  // Merge facts across all query variants (canonical + each alias) by RRF.
  // multiQueryMerge already handles inter-variant ranking — duplicates the
  // same fact across variants accumulate score, which is what we want for
  // facts that match multiple alias forms.
  const mergedHybridFacts = multiQueryMerge(hybridResults.map((r) => r.facts), limit * 2);

  // Then dedupe the merged hybrid set against the entity-linked facts so
  // facts already pulled by entity_id don't get listed twice.
  const seenIds = new Set(entityFactsMarked.map((f) => f.id));
  const hybridExtra = mergedHybridFacts
    .filter((f) => !seenIds.has(f.id))
    .map((f) => ({ ...f, source: 'search' }));

  const facts = [...entityFactsMarked, ...hybridExtra].slice(0, limit);

  // Same merge for chunks (chunks aren't entity-linked, so this is the
  // ONLY way historical-name chunks surface for a renamed query).
  const chunks = includeChunks
    ? multiQueryMerge(hybridResults.map((r) => r.chunks || []), limit)
    : [];

  const relatedEntities = entityRelations.map((r) => ({
    id: r.entityId,
    name: r.name,
    type: r.entityType,
    relation: r.relationType,
    direction: r.direction,
    mentions: r.mentionCount,
  }));

  return {
    facts,
    chunks,
    matchedEntity: {
      id: entity.id,
      name: entity.name,
      type: entity.entityType,
      mentions: entity.mentionCount,
      description: entity.description || null,
      aliases: entity.aliases || [],
    },
    relatedEntities,
  };
}

// Generate query variants by substituting the canonical entity name with
// each alias. If the original query doesn't contain the canonical name as
// a word (e.g. user typed an alias directly), fall back to running a
// search for the alias as-is so chunks/facts using either form still
// surface.
//
// Original  : "What did we decide about Sigil?"
// Variants  : ["What did we decide about Sigil?", "What did we decide about smara?"]
//
// Original  : "Smara"   (alias typed directly; entity has canonical name "Sigil")
// Variants  : ["Smara"]   — no canonical-name occurrence to substitute, but the
//                          query already matches the alias, so the original is fine.
function buildAliasQueryVariants(query, entity) {
  const variants = [query];
  const aliases = (entity.aliases || []).filter((a) => typeof a === 'string' && a.trim());
  if (!aliases.length) return variants;

  const canonical = (entity.name || '').trim();
  const seen = new Set([query.toLowerCase()]);

  for (const alias of aliases) {
    let v = query;
    if (canonical) {
      const re = new RegExp(`\\b${escapeRegex(canonical)}\\b`, 'gi');
      if (re.test(v)) {
        v = v.replace(re, alias);
      } else {
        // No canonical occurrence to replace — also include the alias as
        // a bare query so vector/keyword can hit historical text.
        if (!seen.has(alias.toLowerCase())) {
          variants.push(alias);
          seen.add(alias.toLowerCase());
        }
        continue;
      }
    }
    if (!seen.has(v.toLowerCase())) {
      variants.push(v);
      seen.add(v.toLowerCase());
    }
  }

  return variants;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// No entity match: expand query into variants, search all in parallel, merge
async function standardSearch(query, { namespaces, limit, minConfidence, useGraph, includeChunks, pointInTime, expand = false, categories }) {
  const queries = expand ? await expandQuery(query) : [query];
  const embeddings = await embedBatch(queries, { inputType: 'query' });

  const results = await Promise.all(
    queries.map((q, i) => coreHybridSearch(q, { queryEmbedding: embeddings[i], namespaces, limit, minConfidence, includeChunks, pointInTime, categories })),
  );

  let facts = multiQueryMerge(results.map((r) => r.facts), limit);
  facts = facts.map((f) => ({ ...f, source: 'search' }));

  if (useGraph && facts.length) {
    try {
      const mentionedEntities = await extractEntitiesFromFacts(facts.slice(0, 5));
      if (mentionedEntities.length) {
        const relatedFacts = await findRelatedFacts(
          mentionedEntities.map((e) => e.id),
          { limit: 5 },
        );
        facts = rerank(facts, relatedFacts, mentionedEntities.map((e) => e.id), limit);
      }
    } catch (err) {
      console.error('[graph-enhancement] Failed:', err.message);
    }
  }

  const chunks = includeChunks
    ? multiQueryMerge(results.map((r) => r.chunks), limit)
    : [];

  return {
    facts,
    chunks,
    matchedEntity: null,
    relatedEntities: [],
  };
}

// Merge results from multiple query variants using RRF
function multiQueryMerge(resultSets, limit) {
  const scores = {};
  const itemsById = {};

  for (const results of resultSets) {
    for (const [rank, item] of results.entries()) {
      itemsById[item.id] = item;
      scores[item.id] = (scores[item.id] || 0) + 1 / (RRF_K + rank + 1);
    }
  }

  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const maxScore = entries.length ? entries[0][1] : 1;

  return entries
    .slice(0, limit)
    .map(([id, score]) => ({
      ...itemsById[id],
      rrfScore: Math.round((score / maxScore) * 100) / 100,
    }));
}

// Core vector+keyword hybrid with RRF merge.
// Facts use single-SQL-query RRF (see hybrid-sql.js). Chunks stay on the
// two-query + JS-merge path since they have no category/confidence filters.
async function coreHybridSearch(query, { queryEmbedding: precomputed, namespaces, limit, minConfidence, includeChunks = false, pointInTime, categories }) {
  const queryEmbedding = precomputed || await embed(query, { inputType: 'query' });

  const factsPromise = hybridSearchFacts(query, queryEmbedding, {
    namespaces, limit, minConfidence, pointInTime, categories,
  });

  const chunkPromises = includeChunks
    ? [
        vectorSearch.searchChunks(queryEmbedding, { namespaces, limit }),
        keywordSearch.searchChunks(query, { namespaces, limit }),
      ]
    : [];

  const [facts, ...chunkResults] = await Promise.all([factsPromise, ...chunkPromises]);

  const chunks = includeChunks && chunkResults.length === 2
    ? rrfMerge(chunkResults[0], chunkResults[1], limit)
    : [];

  return { facts, chunks };
}

function rrfMerge(vectorResults, keywordResults, limit) {
  const scores = {};
  const itemsById = {
    ...keyBy(vectorResults, 'id'),
    ...keyBy(keywordResults, 'id'),
  };

  vectorResults.forEach((item, rank) => {
    scores[item.id] = (scores[item.id] || 0) + VECTOR_WEIGHT / (RRF_K + rank + 1);
  });

  keywordResults.forEach((item, rank) => {
    scores[item.id] = (scores[item.id] || 0) + KEYWORD_WEIGHT / (RRF_K + rank + 1);
  });

  // Normalize scores to 0-1 range, with vital facts sorted before supplementary at same score
  const entries = Object.entries(scores).sort(([idA, a], [idB, b]) => {
    if (a !== b) return b - a;
    const importanceA = itemsById[idA]?.importance === 'vital' ? 1 : 0;
    const importanceB = itemsById[idB]?.importance === 'vital' ? 1 : 0;
    return importanceB - importanceA;
  });
  const maxScore = entries.length ? entries[0][1] : 1;

  return entries
    .slice(0, limit)
    .map(([id, score]) => ({
      ...itemsById[id],
      rrfScore: Math.round((score / maxScore) * 100) / 100,
    }));
}

export { search };
