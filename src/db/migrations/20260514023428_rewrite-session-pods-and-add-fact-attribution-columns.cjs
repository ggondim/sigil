/**
 * 0.10.0 — Pod distinction layer foundation.
 *
 * Three changes:
 *   1. Rewrite pod_type='session' rows to 'claude_session'. The pod kind
 *      registry treats the original Claude Code session pod as one of many
 *      kinds (alongside project, person, playbook, vital); the name needs
 *      to reflect that. No CHECK constraint exists on pod_type — the
 *      column is plain text — so this is just an UPDATE.
 *
 *   2. Add fact.importance_score INTEGER. Existing fact.importance is a
 *      text enum (vital | high | medium | supplementary | trivial); the
 *      hot-context decay function in 0.10.0 needs a numeric scale.
 *      Backfill: vital=5, high=4, medium=3, supplementary=2, trivial=1.
 *      The text column stays as the authoritative input from the LLM
 *      extractor; the numeric is the derived score retrieval uses.
 *
 *   3. Add fact.superseded_at TIMESTAMP and fact.superseded_by_fact_uid
 *      TEXT for the append-only / bi-temporal pattern (Graphiti). Existing
 *      valid_from / valid_until already cover event-time validity; these
 *      add transaction-time supersession (the arbiter agent that lands in
 *      0.11.0 will populate them).
 */

exports.up = async function (knex) {
  // 1. Rewrite session → claude_session
  await knex.raw("UPDATE pod SET pod_type = 'claude_session' WHERE pod_type = 'session'");

  // 2. Add fact.importance_score with backfill
  const hasImportanceScore = await knex.schema.hasColumn('fact', 'importance_score');
  if (!hasImportanceScore) {
    await knex.schema.alterTable('fact', (table) => {
      table.integer('importance_score');
    });
    await knex.raw(`
      UPDATE fact SET importance_score = CASE importance
        WHEN 'vital'         THEN 5
        WHEN 'high'          THEN 4
        WHEN 'medium'        THEN 3
        WHEN 'supplementary' THEN 2
        WHEN 'trivial'       THEN 1
        ELSE 2
      END
    `);
    await knex.schema.alterTable('fact', (table) => {
      table.integer('importance_score').defaultTo(2).notNullable().alter();
    });
    await knex.schema.alterTable('fact', (table) => {
      table.index('importance_score');
    });
  }

  // 3. Add supersession columns
  const hasSupersededAt = await knex.schema.hasColumn('fact', 'superseded_at');
  if (!hasSupersededAt) {
    await knex.schema.alterTable('fact', (table) => {
      table.timestamp('superseded_at');
      table.text('superseded_by_fact_uid');
    });
    await knex.schema.alterTable('fact', (table) => {
      table.index('superseded_at');
    });
  }
};

exports.down = async function (knex) {
  // 3. Drop supersession columns
  if (await knex.schema.hasColumn('fact', 'superseded_at')) {
    await knex.schema.alterTable('fact', (table) => {
      table.dropIndex('superseded_at');
      table.dropColumn('superseded_at');
      table.dropColumn('superseded_by_fact_uid');
    });
  }

  // 2. Drop importance_score
  if (await knex.schema.hasColumn('fact', 'importance_score')) {
    await knex.schema.alterTable('fact', (table) => {
      table.dropIndex('importance_score');
      table.dropColumn('importance_score');
    });
  }

  // 1. Rewrite claude_session → session
  await knex.raw("UPDATE pod SET pod_type = 'session' WHERE pod_type = 'claude_session'");
};
