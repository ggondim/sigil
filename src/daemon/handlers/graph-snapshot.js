/**
 * graphSnapshot — the whole knowledge base as one node/edge set, for the
 * dashboard's Obsidian-style graph view.
 *
 * Nodes are facts AND entities; edges are:
 *   - fact_entity links  (a fact mentions an entity)   kind: 'mentions'
 *   - relation rows      (entity → entity)             kind: 'relation'
 *
 * Returns the full set in one round-trip (four bounded selects) instead of
 * the GUI fanning out one getFactContext per fact. Facts are capped by
 * `limit` (most-recent first); when the cap truncates, `truncated` is true so
 * the client can say so rather than silently implying it drew the whole KB.
 */
export function registerGraphSnapshot(registry) {
  registry.register('graphSnapshot', async (params = {}) => {
    const { default: cortexDb } = await import('../../db/cortex.js');
    const { default: config } = await import('../../config.js');

    const namespace = params.namespace || null;
    const FACT_CAP = Number.isFinite(params.limit) ? Math.min(params.limit, 2000) : 600;
    const CONTENT_MAX = 160;

    // ── facts (capped, newest first) ─────────────────────────────────
    let factQ = cortexDb('fact')
      .where({ status: 'active' })
      .select('id', 'content', 'category', 'namespace')
      .orderBy('created_at', 'desc')
      .limit(FACT_CAP + 1); // +1 to detect truncation
    if (namespace) factQ = factQ.where({ namespace });
    const factRows = await factQ;
    const truncated = factRows.length > FACT_CAP;
    const facts = truncated ? factRows.slice(0, FACT_CAP) : factRows;
    const factIds = facts.map((f) => f.id);

    // ── entities ─────────────────────────────────────────────────────
    let entQ = cortexDb('entity')
      .select('id', 'name', 'entity_type as entityType', 'mention_count as mentionCount', 'namespace');
    if (namespace) entQ = entQ.where({ namespace });
    const entityRows = await entQ;

    // ── fact→entity links (only for the facts we kept) ───────────────
    const links = factIds.length
      ? await cortexDb('fact_entity')
          .whereIn('fact_id', factIds)
          .select('fact_id as factId', 'entity_id as entityId')
      : [];

    // ── entity→entity relations ──────────────────────────────────────
    const relations = await cortexDb('relation')
      .select('source_id as sourceId', 'target_id as targetId', 'relation_type as relationType');

    // ── assemble ─────────────────────────────────────────────────────
    const degree = new Map();
    const bump = (key) => degree.set(key, (degree.get(key) || 0) + 1);

    const edges = [];
    const entityIds = new Set(entityRows.map((e) => e.id));
    const factIdSet = new Set(factIds);

    for (const l of links) {
      const s = `f${l.factId}`, t = `e${l.entityId}`;
      if (!factIdSet.has(l.factId) || !entityIds.has(l.entityId)) continue;
      edges.push({ source: s, target: t, kind: 'mentions' });
      bump(s); bump(t);
    }
    for (const r of relations) {
      const s = `e${r.sourceId}`, t = `e${r.targetId}`;
      if (!entityIds.has(r.sourceId) || !entityIds.has(r.targetId)) continue;
      edges.push({ source: s, target: t, kind: 'relation', label: r.relationType });
      bump(s); bump(t);
    }

    const nodes = [
      ...entityRows.map((e) => ({
        id: `e${e.id}`,
        refId: e.id,
        kind: 'entity',
        label: e.name,
        entityType: e.entityType || 'topic',
        mentions: e.mentionCount || 0,
        degree: degree.get(`e${e.id}`) || 0,
      })),
      ...facts.map((f) => ({
        id: `f${f.id}`,
        refId: f.id,
        kind: 'fact',
        label: (f.content || '').slice(0, CONTENT_MAX),
        category: f.category || null,
        degree: degree.get(`f${f.id}`) || 0,
      })),
    ];

    return {
      namespace: namespace || config.defaults.namespace,
      nodes,
      edges,
      truncated,
      counts: {
        facts: facts.length,
        entities: entityRows.length,
        edges: edges.length,
        relations: edges.filter((e) => e.kind === 'relation').length,
      },
    };
  });
}
