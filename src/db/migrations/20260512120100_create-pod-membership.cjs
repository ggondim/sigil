/**
 * Polymorphic many-to-many junction linking pods to facts, documents, and
 * entities. A fact can legitimately belong to multiple pods (e.g., a fact
 * about Dhaval extracted in a Claude Code session belongs to both the
 * person pod for Dhaval and the session pod for that conversation), so a
 * single `pod_id` column on the fact row would force a lossy "primary
 * pod" choice.
 *
 * Keeping membership in a junction also preserves the fact row's
 * read-mostly invariant (no HNSW index churn on pod attach/detach) — same
 * discipline as fact_lifecycle (20260424120000).
 *
 * member_id uses bigInteger because fact.id is bigint; document.id and
 * entity.id are int4 but fit fine in the wider column.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('pod_membership', (table) => {
    table.increments('id').primary();
    table
      .integer('pod_id')
      .notNullable()
      .references('id')
      .inTable('pod')
      .onDelete('CASCADE');

    // 'fact' | 'document' | 'entity'. FK not enforced because Postgres
    // does not support polymorphic FKs; integrity is the caller's
    // responsibility (membership.js).
    table.text('member_type').notNullable();
    table.bigInteger('member_id').notNullable();

    // 'primary' (this pod owns the member) | 'contextual' (member is
    // referenced from this pod's perspective) | 'mention' (member just
    // mentions an entity associated with this pod). Free string for now;
    // promote to enum once the values settle.
    table.text('role');

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['pod_id', 'member_type', 'member_id']);

    // Reverse lookup: "what pods is this fact/document/entity in?"
    table.index(['member_type', 'member_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('pod_membership');
};
