/**
 * editFact — human curation of a stored fact.
 *   - Reclassify (category / importance / confidence): a cheap column UPDATE.
 *   - Edit content: RE-EMBEDS the fact (otherwise the vector desyncs from the
 *     text and search silently degrades) and refreshes the tsvector.
 *   Accepts a numeric id, full UID, or UID prefix (same as forgetFact).
 *
 * setPodConfig — patch a pod's attrs. Today only `language` (per-project fact
 * language, read by the ingest pipeline); the shape leaves room for more.
 */
import { ALL_CATEGORIES } from '../../memory/facts/categories.js';

// 'note' is a real stored category (the LLM-less hosted path stamps it), so it
// must be accepted here even though it isn't in the classifier's taxonomy.
const VALID_CATEGORIES = [...Object.keys(ALL_CATEGORIES), 'note'];
const VALID_IMPORTANCE = ['vital', 'supplementary'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

export function registerEditFact(registry) {
  registry.register('editFact', async (params) => {
    const { default: cortexDb } = await import('../../db/cortex.js');
    const { pgVector } = await import('../../lib/vectors.js');
    const { embedOrThrow } = await import('../../ingestion/embedder.js');
    const factStore = await import('../../memory/facts/store.js');

    const idArg = String(params.id ?? params.uid ?? '').trim();
    if (!idArg) {
      const e = new Error('editFact: params.id or params.uid required');
      e.code = 'invalid_params';
      throw e;
    }

    const [fact] = /^\d+$/.test(idArg)
      ? await cortexDb('fact').where({ id: Number(idArg) }).limit(1)
      : await cortexDb('fact').where('uid', 'like', `${idArg}%`).limit(1);
    if (!fact) return { notFound: true, query: idArg };

    // Validate any provided classification fields up front.
    for (const [k, valid] of [['category', VALID_CATEGORIES], ['importance', VALID_IMPORTANCE], ['confidence', VALID_CONFIDENCE]]) {
      if (params[k] !== undefined && !valid.includes(params[k])) {
        const e = new Error(`editFact: invalid ${k} "${params[k]}"`);
        e.code = 'invalid_params';
        throw e;
      }
    }

    const patch = {};
    if (params.category !== undefined) patch.category = params.category;
    if (params.importance !== undefined) patch.importance = params.importance;
    if (params.confidence !== undefined) patch.confidence = params.confidence;

    const newContent = typeof params.content === 'string' ? params.content.trim() : null;
    const contentChanged = newContent !== null && newContent.length > 0 && newContent !== fact.content;
    if (contentChanged) {
      patch.content = newContent;
      const emb = await embedOrThrow(newContent);
      patch.embedding = pgVector(emb);
    }

    if (Object.keys(patch).length === 0) {
      return { unchanged: true, id: fact.id, uid: fact.uid };
    }

    patch.updatedAt = cortexDb.fn.now();
    await cortexDb('fact').where({ id: fact.id }).update(patch);

    if (contentChanged) {
      await cortexDb.raw(
        "UPDATE fact SET search_vector = to_tsvector('english', content) WHERE id = ?",
        [fact.id],
      );
      // Best-effort audit trail; never let it fail the edit.
      if (typeof factStore.recordHistory === 'function') {
        await factStore.recordHistory({
          targetType: 'fact', targetId: fact.id, event: 'EDIT',
          oldContent: fact.content, newContent, triggeredBy: 'curation:editFact',
        }).catch(() => {});
      }
    }

    const [updated] = await cortexDb('fact').where({ id: fact.id }).limit(1);
    return {
      id: updated.id,
      uid: updated.uid,
      content: updated.content,
      category: updated.category,
      importance: updated.importance,
      confidence: updated.confidence,
      reembedded: contentChanged,
    };
  });

  registry.register('setPodConfig', async (params) => {
    const podStore = await import('../../memory/pods/store.js');
    const ref = params.podUid ?? params.podId;
    if (ref === undefined || ref === null || ref === '') {
      const e = new Error('setPodConfig: podUid or podId required');
      e.code = 'invalid_params';
      throw e;
    }
    const pod = params.podUid
      ? await podStore.findByUid(params.podUid)
      : await podStore.findById(Number(params.podId));
    if (!pod) return { notFound: true, query: ref };

    const patch = {};
    if (params.language !== undefined) {
      patch.language = params.language === null ? '' : String(params.language).trim();
    }
    if (Object.keys(patch).length === 0) {
      const e = new Error('setPodConfig: nothing to set (supported: language)');
      e.code = 'invalid_params';
      throw e;
    }

    await podStore.patchAttrs(pod.id, patch);
    const updated = await podStore.findById(pod.id);
    const attrs = typeof updated.attrs === 'string' ? JSON.parse(updated.attrs) : (updated.attrs || {});
    return { id: pod.id, uid: pod.uid, name: pod.name, attrs };
  });
}
