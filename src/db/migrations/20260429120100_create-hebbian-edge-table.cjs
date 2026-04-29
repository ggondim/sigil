/**
 * Hebbian co-retrieval edges between facts.
 *
 * When two facts are retrieved together in the same search top-K, the edge
 * between them strengthens. Over time, the graph builds itself from search
 * behavior — no LLM calls, no manual annotation.
 *
 * Lexicographic canonicalization (fact_a_id < fact_b_id) prevents the
 * (a,b)/(b,a) duplicate problem that bites symmetric relations. Lesson
 * borrowed from OGHAM-LEARNINGS.md.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('hebbian_edge', (table) => {
    table.bigInteger('fact_a_id').notNullable().references('id').inTable('fact').onDelete('CASCADE');
    table.bigInteger('fact_b_id').notNullable().references('id').inTable('fact').onDelete('CASCADE');
    table.integer('strength').notNullable().defaultTo(1);
    table.timestamp('first_seen_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['fact_a_id', 'fact_b_id']);
  });

  // Enforce canonical ordering at the row level — fact_a_id MUST be less than fact_b_id.
  await knex.raw(`
    ALTER TABLE hebbian_edge
    ADD CONSTRAINT hebbian_edge_canonical_order
    CHECK (fact_a_id < fact_b_id)
  `);

  // For walking outward from a single fact: index both columns.
  await knex.raw(`CREATE INDEX hebbian_edge_a_idx ON hebbian_edge (fact_a_id, strength DESC)`);
  await knex.raw(`CREATE INDEX hebbian_edge_b_idx ON hebbian_edge (fact_b_id, strength DESC)`);
};

exports.down = async function (knex) {
  await knex.schema.dropTable('hebbian_edge');
};
