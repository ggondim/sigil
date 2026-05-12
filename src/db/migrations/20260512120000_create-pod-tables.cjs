/**
 * Create the `pod` table — typed memory containers that segregate facts,
 * documents, and entities by source or subject. Pods sit on top of the
 * existing fact/entity/document model; they do not replace AUDM, entity
 * dedup, or the namespace partition.
 *
 * Pod types ship in this branch:
 *   - 'session'  → one per Claude Code session (external_id = session_id)
 *   - 'person'   → one per person you have a relationship with
 *                  (entity_id FK to the canonical entity row)
 *
 * Future types reserved (no auto-creation yet):
 *   - 'project', 'connector_workspace', 'custom'
 *
 * Membership lives in a separate `pod_membership` junction (next migration)
 * so the `fact` row stays read-mostly and the HNSW index does not bloat —
 * same discipline as the 20260424 fact_lifecycle split.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('pod', (table) => {
    table.increments('id').primary();
    table.text('uid').notNullable().unique();
    table.text('pod_type').notNullable();
    table.text('name').notNullable();
    table.text('namespace').notNullable();
    table.jsonb('attrs').notNullable().defaultTo('{}');
    table.text('status').notNullable().defaultTo('active'); // active | archived

    // Person/project pods link to their canonical entity. Nullable for
    // session/workspace pods.
    table.integer('entity_id').references('id').inTable('entity');

    // Connector-workspace pods link to their connection. Nullable for
    // session/person pods.
    table.integer('connection_id').references('id').inTable('connection');

    // Stable external identifier for upsert idempotency. For session pods
    // this is the Claude Code session_id; for workspace pods this is the
    // platform's team/org id.
    table.text('external_id');

    table.timestamp('started_at');
    table.timestamp('ended_at');

    // Denormalised member counters, refreshed by `sigil maintain` (or
    // incrementally by membership writes). Cheap to keep, expensive to
    // recompute on demand.
    table.integer('member_doc_count').notNullable().defaultTo(0);
    table.integer('member_fact_count').notNullable().defaultTo(0);

    table.timestamps(false, true);

    table.index('pod_type');
    table.index('namespace');
    table.index(['namespace', 'pod_type', 'status']);
  });

  // Upsert key: (pod_type, external_id, namespace) where external_id is set.
  // Partial unique because external_id is nullable (custom pods may have none).
  await knex.raw(`
    CREATE UNIQUE INDEX pod_external_id_unique
      ON pod (pod_type, external_id, namespace)
      WHERE external_id IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS pod_external_id_unique');
  await knex.schema.dropTableIfExists('pod');
};
