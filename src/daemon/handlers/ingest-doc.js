/**
 * ingestDoc — ingest a resolved document (content, filePath, or URL).
 *
 * Distinct from `remember` (CLI), which only handles plain fact strings.
 *
 * Supports `params.background`: queue the ingest and return immediately. Graph-
 * building is LLM-heavy and can exceed the RPC timeout, so — like every graph-
 * memory system (Graphiti, GraphRAG, HippoRAG) — the write is made async and
 * the cleverness lives at read time. Background jobs run through a serial queue
 * so concurrent ingests don't race on entity create/rename (the same invariant
 * `remember` protects with sequential processing).
 */

// Serial queue: chain background ingests so only one runs at a time.
let queueTail = Promise.resolve();
function enqueue(job) {
  const run = queueTail.then(job, job);
  // Keep the chain alive even if a job throws, but don't accumulate rejections.
  queueTail = run.catch(() => {});
  return run;
}

async function doIngest(params) {
  const { ingestDocument } = await import('../../ingestion/pipeline.js');
  const { resolveSource } = await import('../../ingestion/resolve-source.js');

  const { content, filePath, url, title, namespace, sourceType, skipFacts, skipEntities, metadata } = params;
  const source = await resolveSource({ content, filePath, url, title, sourceType });
  if (!source) {
    const err = new Error('ingestDoc: provide content, filePath, or url');
    err.code = 'invalid_params';
    throw err;
  }

  const result = await ingestDocument({
    content: source.content,
    title: title || source.title,
    sourcePath: source.sourcePath,
    sourceType: sourceType || source.sourceType,
    contentType: source.contentType,
    namespace,
    metadata: metadata || source.metadata,
    skipFacts,
    skipEntities,
  });

  const response = {
    skipped: Boolean(result.skipped),
    title: result.title ?? null,
    documentId: result.documentId ?? null,
    chunkCount: result.chunkCount ?? 0,
    facts: result.facts ?? null,
    entities: result.entities ?? null,
    output: result.md?.url ?? null,
  };

  const f = response.facts || {};
  const { recordTrace } = await import('../trace-store.js');
  recordTrace({
    kind: 'ingest',
    summary: `ingest "${String(response.title || 'document').slice(0, 60)}" → ${response.chunkCount} chunks, +${f.added ?? 0} facts${response.skipped ? ' (skipped)' : ''}`,
    namespace: namespace || null,
    detail: {
      op: 'ingestDoc',
      title: response.title,
      documentId: response.documentId,
      skipped: response.skipped,
      route: result.route ?? null,
      chunkCount: response.chunkCount,
      counts: { added: f.added ?? 0, updated: f.updated ?? 0, skipped: f.skipped ?? 0, contradicted: f.contradicted ?? 0, total: f.total ?? 0 },
      verdicts: f.verdicts || [],
      entities: response.entities ? { entityCount: response.entities.entityCount, relationCount: response.entities.relationCount, topics: response.entities.topics || [] } : null,
    },
  }).catch(() => {});

  return response;
}

export function registerIngestDoc(registry) {
  registry.register('ingestDoc', async (params) => {
    if (params.background) {
      // Fire-and-forget: queue the work and return an ack immediately. Failures
      // can't propagate to a caller that already left, so log them where
      // `sigil doctor` will surface them.
      const { resolveSource } = await import('../../ingestion/resolve-source.js');
      const source = await resolveSource({
        content: params.content, filePath: params.filePath, url: params.url,
        title: params.title, sourceType: params.sourceType,
      }).catch(() => null);

      enqueue(() => doIngest(params)).catch(async (err) => {
        try {
          const { recordHookError } = await import('../../hooks/error-log.js');
          await recordHookError('ingestDoc', err, String(params.title || params.filePath || params.url || '').slice(0, 200));
        } catch { /* never let logging mask the failure */ }
      });

      return { queued: true, title: params.title || source?.title || null };
    }

    return doIngest(params);
  });
}
