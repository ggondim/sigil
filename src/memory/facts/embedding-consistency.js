/**
 * Corpus embedding-consistency check.
 *
 * Cosine similarity is only meaningful between vectors from the SAME embedding
 * model. If the user switches embedding providers/models mid-corpus, old and
 * new facts live in different vector spaces and ranking silently degrades —
 * plausible-but-wrong facts get retrieved. Facts stamp `embedding_model`, so we
 * can detect the mix and point at the fix (`sigil repair embeddings`, which
 * re-embeds everything under the current model).
 *
 * Read-only. Surfaced in `sigil doctor` and on a provider switch in setup.
 */
import cortexDb from '../../db/cortex.js';
import config from '../../config.js';

export async function checkCorpusConsistency({ namespace = null } = {}) {
  let q = cortexDb('fact').where({ status: 'active' }).whereNotNull('embedding');
  if (namespace) q = q.where({ namespace });
  const rows = await q.select('embeddingModel').count({ c: '*' }).groupBy('embeddingModel');

  const histogram = rows
    .map((r) => ({ model: r.embeddingModel || '(unknown)', count: Number(r.c) }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count);

  const total = histogram.reduce((a, h) => a + h.count, 0);
  const current = config.embedding.model || null;
  const mixed = histogram.length > 1;
  // Facts NOT under the currently-configured model (these rank incorrectly).
  const stale = histogram.filter((h) => h.model !== current).reduce((a, h) => a + h.count, 0);

  return { current, histogram, mixed, total, stale };
}
