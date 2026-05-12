import { uniqBy } from 'lodash-es';

import cortexDb from '../../db/cortex.js';
import * as podMembership from '../pods/membership.js';

async function linkEntitiesToFact(factId, entities) {
  if (!entities.length) return;

  // Dedupe by entity id — same fact-entity pair appearing twice in one INSERT trips ON CONFLICT DO UPDATE
  // ("cannot affect row a second time"). This happens when entity resolution maps multiple raw mentions
  // to the same canonical entity within a single fact.
  const uniqueEntities = uniqBy(entities, 'id');

  const rows = uniqueEntities.map((e) => ({
    factId,
    entityId: e.id,
    mentionType: 'content',
    mentionCount: 1,
  }));

  await cortexDb('fact_entity')
    .insert(rows)
    .onConflict(cortexDb.raw('(fact_id, entity_id, mention_type)'))
    .merge({ mentionCount: cortexDb.raw('fact_entity.mention_count + 1') });

  await attachFactToEntityPods(factId, uniqueEntities);
}

// When a fact mentions an entity that backs a pod (today: person pods only),
// attach the fact to that pod with role='mention'. This is the live wire
// behind hot-context's 4 person slots — without it, person pods exist but
// `facts=0` and the slots never fill.
async function attachFactToEntityPods(factId, entities) {
  const entityIds = entities.map((e) => e.id).filter(Boolean);
  if (!entityIds.length) return;

  const podRows = await cortexDb('pod')
    .whereIn('entityId', entityIds)
    .where({ status: 'active' })
    .select('id');

  for (const { id: podId } of podRows) {
    await podMembership.attachFact(podId, factId, 'mention');
  }
}

async function getFactsForEntity(entityId, { limit = 50 } = {}) {
  return cortexDb('fact')
    .join('fact_entity', 'fact.id', 'fact_entity.fact_id')
    .where('fact_entity.entity_id', entityId)
    .where('fact.status', 'active')
    .select('fact.*', 'fact_entity.mention_count as entityMentionCount')
    .orderBy('fact_entity.mention_count', 'desc')
    .limit(limit);
}

async function getEntitiesForFact(factId) {
  return cortexDb('entity')
    .join('fact_entity', 'entity.id', 'fact_entity.entity_id')
    .where('fact_entity.fact_id', factId)
    .whereNull('entity.mergedWith')
    .select('entity.id', 'entity.uid', 'entity.name', 'entity.entityType', 'entity.description');
}

async function getEntityIdsForFacts(factIds) {
  if (!factIds.length) return new Map();

  const rows = await cortexDb('fact_entity')
    .whereIn('factId', factIds)
    .select('factId', 'entityId');

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.factId)) map.set(row.factId, []);
    map.get(row.factId).push(row.entityId);
  }
  return map;
}

export { linkEntitiesToFact, getFactsForEntity, getEntitiesForFact, getEntityIdsForFacts };
