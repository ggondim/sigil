import config from '../config.js';
import { EMBEDDING_DIM } from '../lib/constants.js';
import { withRetry } from '../lib/llm/log.js';
import { getEmbedder, detectEmbeddingProvider } from '../lib/llm/registry.js';
import { embedBatchCached } from './embedding-cache.js';

const { dimensions } = config.embedding;

async function embed(text, opts = {}) {
  const [result] = await embedBatch([text], opts);
  return result;
}

/**
 * Assert a batch of vectors is safe to persist: right count, and every vector
 * is a 1024-d (EMBEDDING_DIM) number[]. A NULL/empty/wrong-dim vector that
 * reaches the `vector` column produces a real-but-invisible fact (search
 * filters `WHERE embedding IS NOT NULL`), or corrupts cosine ranking. Fail
 * loud at the boundary instead. Throws err.code='embedding_invalid'.
 */
function assertEmbeddings(vectors, expectedCount) {
  const bad = (msg, extra = {}) => {
    const err = new Error(`${msg} (provider=${config.embedding.provider || '?'}, model=${config.embedding.model || '?'})`);
    err.code = 'embedding_invalid';
    Object.assign(err, extra);
    return err;
  };
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw bad(`embedding batch returned ${Array.isArray(vectors) ? vectors.length : typeof vectors} vectors for ${expectedCount} inputs`);
  }
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    const len = Array.isArray(v) ? v.length : null;
    if (len !== EMBEDDING_DIM) {
      throw bad(`embedding[${i}] has ${len ?? typeof v} dims, expected ${EMBEDDING_DIM}`, { expected: EMBEDDING_DIM, got: len });
    }
  }
}

/**
 * The guarded embed boundary every WRITE path must use. Adds the resilience
 * LLM calls already have (withRetry on transient failures) and the validation
 * none of them had (length + dimension). Use this — not embedBatch — anywhere
 * the result is persisted.
 */
async function embedBatchOrThrow(texts, opts = {}) {
  if (!texts.length) return [];
  const vectors = await withRetry(() => embedBatch(texts, opts), config.llm.maxRetries);
  assertEmbeddings(vectors, texts.length);
  return vectors;
}

async function embedOrThrow(text, opts = {}) {
  const [result] = await embedBatchOrThrow([text], opts);
  return result;
}

// `cache: false` bypasses the Postgres-backed embedding cache and calls the
// provider directly. Used by the onboarding embed test, which runs BEFORE the
// database step — the cache lookup would otherwise fail with a misleading
// "Postgres is not reachable" error that has nothing to do with the embedder.
async function embedBatch(texts, { inputType = 'document', cache = true } = {}) {
  if (!texts.length) return [];

  const provider = await detectEmbeddingProvider();
  const batchFn = await getEmbedder(provider);
  const model = config.embedding.model;

  // Re-embedding the same text is wasteful — check the cache first.
  // inputType is part of the cache key because Voyage produces different
  // embeddings for `document` vs `query` even on identical text.
  const providerConfig = { ...config.embedding, inputType };
  if (!cache) return batchFn(texts, providerConfig);
  return embedBatchCached(texts, provider, model, batchFn, providerConfig, { inputType });
}

export { embed, embedBatch, embedOrThrow, embedBatchOrThrow, assertEmbeddings, dimensions };
