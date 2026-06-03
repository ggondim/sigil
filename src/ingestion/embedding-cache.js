/**
 * Persistent embedding cache backed by PGlite.
 *
 * Avoids re-embedding identical text across restarts. Saves significant time
 * and cost on re-ingestion of large corpora — SHA-256 of content is the key,
 * so even content-hash-unchanged documents benefit.
 *
 * Layer sits between embedder.js (provider-agnostic) and the provider modules.
 * Cache miss → delegate to provider → store. LRU-ish eviction at write time
 * when size crosses a soft limit.
 */

import { createHash } from 'node:crypto';
import { pgVector } from '../lib/vectors.js';
import cortexDb from '../db/cortex.js';

const MAX_CACHE_SIZE = 10_000;
const EVICT_BATCH = 500; // Evict in batches to avoid single-row churn on every write

function cacheKey(provider, model, text, inputType = 'document') {
  const h = createHash('sha256');
  h.update(provider);
  h.update('\x00');
  h.update(model);
  h.update('\x00');
  h.update(inputType);
  h.update('\x00');
  h.update(text);
  return h.digest('hex');
}

async function getCached(keys) {
  if (!keys.length) return new Map();
  const rows = await cortexDb('embedding_cache')
    .whereIn('key', keys)
    .select('key', 'embedding');
  // pgvector columns deserialize as the literal string "[1,2,3]" — parse back to a number[]
  // so callers can treat embeddings uniformly as arrays regardless of cache hit/miss.
  return new Map(rows.map((r) => [r.key, parseVector(r.embedding)]));
}

function parseVector(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return v;
  // Format is "[1.23,4.56,...]"
  const inner = v.startsWith('[') ? v.slice(1, -1) : v;
  return inner.split(',').map(Number);
}

async function recordHits(keys) {
  if (!keys.length) return;
  await cortexDb('embedding_cache')
    .whereIn('key', keys)
    .update({
      hits: cortexDb.raw('hits + 1'),
      lastUsedAt: cortexDb.fn.now(),
    });
}

// Postgres caps a statement at 65535 bind params; at 4 params/row that's ~16k
// rows. Chunk well under that so a huge re-ingest can't blow the limit.
const STORE_CHUNK = 500;

async function storeBatch(entries, provider, model) {
  if (!entries.length) return;

  // One multi-row upsert per chunk instead of N serial round-trips. Raw SQL so
  // we can bind pgvector string literals.
  for (let start = 0; start < entries.length; start += STORE_CHUNK) {
    const chunk = entries.slice(start, start + STORE_CHUNK);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?, 0, NOW(), NOW())').join(', ');
    const params = [];
    for (const { key, embedding } of chunk) {
      params.push(key, provider, model, pgVector(embedding));
    }
    await cortexDb.raw(`
      INSERT INTO embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
      VALUES ${valuesSql}
      ON CONFLICT (key) DO UPDATE
        SET last_used_at = NOW(),
            hits = embedding_cache.hits + 1
    `, params);
  }

  // Opportunistic eviction — cheap bulk delete of least-recently-used rows
  await evictIfOverLimit();
}

let lastEvictCheckAt = 0;
const EVICT_CHECK_INTERVAL_MS = 60_000;

async function evictIfOverLimit() {
  // Only check size periodically to avoid a count(*) on every write
  const now = Date.now();
  if (now - lastEvictCheckAt < EVICT_CHECK_INTERVAL_MS) return;
  lastEvictCheckAt = now;

  const [{ count }] = await cortexDb('embedding_cache').count('key as count');
  const total = Number(count);
  if (total <= MAX_CACHE_SIZE) return;

  const toEvict = Math.min(total - MAX_CACHE_SIZE, EVICT_BATCH);
  await cortexDb.raw(`
    DELETE FROM embedding_cache WHERE key IN (
      SELECT key FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
    )
  `, [toEvict]);
}

/**
 * Batch embed with cache.
 *
 * Texts that hit the cache are served from pgvector. Misses go to the
 * underlying provider function and are cached on the way back.
 *
 * Returns results in the same order as input texts.
 */
async function embedBatchCached(texts, providerName, modelName, providerFn, providerConfig, opts = {}) {
  if (!texts.length) return [];

  const inputType = opts.inputType || providerConfig?.inputType || 'document';
  const keys = texts.map((t) => cacheKey(providerName, modelName, t, inputType));
  const cached = await getCached(keys);

  const missTexts = [];
  const missIndexes = [];
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i++) {
    const hit = cached.get(keys[i]);
    if (hit) {
      results[i] = hit;
    } else {
      missTexts.push(texts[i]);
      missIndexes.push(i);
    }
  }

  if (missTexts.length) {
    const freshEmbeddings = await providerFn(missTexts, providerConfig);
    const toStore = [];
    for (let m = 0; m < missTexts.length; m++) {
      const i = missIndexes[m];
      results[i] = freshEmbeddings[m];
      toStore.push({ key: keys[i], embedding: freshEmbeddings[m] });
    }
    // Fire and forget — don't block returning results on cache write
    storeBatch(toStore, providerName, modelName).catch((err) => {
      process.stderr.write(`[embedding-cache] store failed: ${err.message}\n`);
    });
  }

  // Record hits async (non-blocking)
  const hitKeys = keys.filter((k) => cached.has(k));
  if (hitKeys.length) {
    recordHits(hitKeys).catch(() => { /* best-effort */ });
  }

  return results;
}

export { embedBatchCached, cacheKey };
