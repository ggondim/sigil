/**
 * Voyage AI embedder. Voyage-3-large is the current MTEB top of the open-API
 * embedding models (~76, ~12 points above nomic-embed). Anthropic's contextual
 * retrieval blog explicitly recommends it as the embedding model paired with
 * Claude.
 *
 * voyage-3-large outputs 1024d. Smaller variants and dimension truncation aren't
 * exposed via API; if a future user needs 768d, swap to voyage-3-lite (1024d
 * but cheaper) and reindex, or use a different provider.
 *
 * The `input_type` parameter lets Voyage optimize embeddings differently for
 * document vs query usage — measurable quality gain per their benchmarks.
 */

import { chunk } from '../../collection.js';
import config from '../../../config.js';

// Voyage's per-request limits. voyage-3 family allows up to 1000 inputs per
// request, but practical batch size is bounded by total token count (120K-ish).
// 50 inputs × ~1K tokens ≈ 50K, well within limits.
const BATCH_SIZE = 50;

async function embedBatch(texts, { model, voyageApiKey, inputType = 'document', dimensions } = {}) {
  if (!voyageApiKey) {
    throw new Error('VOYAGE_API_KEY is not set. Get one at dashboard.voyageai.com.');
  }

  const batches = chunk(texts, BATCH_SIZE);
  const allEmbeddings = [];

  for (const batch of batches) {
    const body = {
      input: batch,
      model: model || 'voyage-3-large',
      // Voyage accepts 'document' (for ingest content) or 'query' (for search input).
      // Skipping it falls back to general-purpose which is measurably worse.
      input_type: inputType === 'query' ? 'query' : 'document',
    };
    if (dimensions) body.output_dimension = dimensions;

    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      signal: AbortSignal.timeout(config.llm.requestTimeout),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voyageApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Voyage embed failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    // Voyage returns {data: [{embedding, index}, ...], model, usage}
    // Indexes are returned in input order but defensive sort keeps it safe.
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d) => d.embedding));
  }

  return allEmbeddings;
}

export { embedBatch };
