import config from '../config.js';
import { getEmbedder, detectEmbeddingProvider } from '../lib/llm/registry.js';
import { embedBatchCached } from './embedding-cache.js';

const { dimensions } = config.embedding;

async function embed(text, opts = {}) {
  const [result] = await embedBatch([text], opts);
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

export { embed, embedBatch, dimensions };
