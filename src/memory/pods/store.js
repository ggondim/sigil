import { nanoid } from 'nanoid';

import cortexDb from '../../db/cortex.js';
import config from '../../config.js';

// Insert a new pod row. Callers that want idempotency on (pod_type,
// external_id, namespace) should use upsertPod instead.
async function insertPod({
  podType,
  name,
  namespace,
  attrs = {},
  entityId = null,
  connectionId = null,
  externalId = null,
  startedAt = null,
  endedAt = null,
}) {
  const uid = `pod-${nanoid(16)}`;

  const [pod] = await cortexDb('pod')
    .insert({
      uid,
      podType,
      name,
      namespace: namespace || config.defaults.namespace,
      attrs: JSON.stringify(attrs),
      entityId,
      connectionId,
      externalId,
      startedAt,
      endedAt,
    })
    .returning('*');

  return pod;
}

// Idempotent upsert keyed on the partial unique
// (pod_type, external_id, namespace) where external_id IS NOT NULL.
// Used for session pods (external_id = session_id) and connector-workspace
// pods (external_id = team_id). Returns { pod, isNew }.
//
// On conflict the row's `attrs` is *merged* with the incoming value so
// hook upserts can refine fields (turn_count++, conclusion) without
// blowing away earlier ones.
async function upsertPod({
  podType,
  externalId,
  name,
  namespace,
  attrs = {},
  entityId = null,
  connectionId = null,
  startedAt = null,
}) {
  if (!externalId) {
    throw new Error('upsertPod requires externalId; use insertPod for custom pods');
  }

  const uid = `pod-${nanoid(16)}`;
  const ns = namespace || config.defaults.namespace;

  const { rows: [pod] } = await cortexDb.raw(`
    INSERT INTO pod (uid, pod_type, name, namespace, attrs, entity_id, connection_id, external_id, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, NOW(), NOW())
    ON CONFLICT (pod_type, external_id, namespace) WHERE external_id IS NOT NULL DO UPDATE SET
      attrs = pod.attrs || EXCLUDED.attrs,
      updated_at = NOW()
    RETURNING *, (xmax = 0) AS "isNew"
  `, [
    uid,
    podType,
    name,
    ns,
    JSON.stringify(attrs),
    entityId,
    connectionId,
    externalId,
    startedAt,
  ]);

  return { pod, isNew: pod.isNew };
}

async function findByUid(uid) {
  return cortexDb('pod').where({ uid }).first() || null;
}

async function findById(id) {
  return cortexDb('pod').where({ id }).first() || null;
}

async function findByExternalId({ podType, externalId, namespace }) {
  return cortexDb('pod')
    .where({
      podType,
      externalId,
      namespace: namespace || config.defaults.namespace,
    })
    .first() || null;
}

async function findByEntityId(entityId) {
  return cortexDb('pod').where({ entityId }).first() || null;
}

async function listPods({ podType, namespace, status = 'active', limit = 20 } = {}) {
  const query = cortexDb('pod')
    .where({ status })
    .orderBy('updatedAt', 'desc')
    .limit(limit);

  if (podType) query.where({ podType });
  if (namespace) query.where({ namespace });

  return query;
}

async function archivePod(podId) {
  await cortexDb('pod')
    .where({ id: podId })
    .update({ status: 'archived', updatedAt: cortexDb.fn.now() });
}

async function deletePod(podId) {
  // pod_membership rows cascade via ON DELETE CASCADE in the migration.
  await cortexDb('pod').where({ id: podId }).del();
}

// Merge `patch` into pod.attrs in place. Used by session-end to record
// conclusion, by hooks to increment turn_count, etc.
async function patchAttrs(podId, patch) {
  await cortexDb.raw(
    'UPDATE pod SET attrs = attrs || ?::jsonb, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(patch), podId],
  );
}

async function setEndedAt(podId, endedAt = new Date()) {
  await cortexDb('pod')
    .where({ id: podId })
    .update({ endedAt, updatedAt: cortexDb.fn.now() });
}

// Reassign a pod from one entity to another. Used by the entity merger
// when two person-entities collapse — the surviving canonical entity
// inherits the pod so its metadata (role, platforms, notes) doesn't
// vanish in the merge.
async function reassignEntity(oldEntityId, newEntityId) {
  await cortexDb('pod')
    .where({ entityId: oldEntityId })
    .update({ entityId: newEntityId, updatedAt: cortexDb.fn.now() });
}

// Bump cached counters. Cheap on attach; truth is restored by a periodic
// recount in `sigil maintain` if it drifts.
async function incrementCounters(podId, { docs = 0, facts = 0 }) {
  if (!docs && !facts) return;
  await cortexDb.raw(
    `UPDATE pod
       SET member_doc_count = member_doc_count + ?,
           member_fact_count = member_fact_count + ?,
           updated_at = NOW()
     WHERE id = ?`,
    [docs, facts, podId],
  );
}

export {
  insertPod,
  upsertPod,
  findByUid,
  findById,
  findByExternalId,
  findByEntityId,
  listPods,
  archivePod,
  deletePod,
  patchAttrs,
  setEndedAt,
  reassignEntity,
  incrementCounters,
};
