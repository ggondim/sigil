/**
 * Hebbian co-retrieval edges between entities.
 *
 * Sibling of hebbian_edge but for entities, not facts. When a search returns
 * a top-K result set, every entity linked to those facts is considered "co-
 * activated." Pairwise edges between those entities strengthen.
 *
 * Why entities (in addition to fact-level edges):
 *   - Fact-level edges are brittle when the same idea is stored as two
 *     different facts. Entity edges survive paraphrase + AUDM splits.
 *   - The entity graph is already the substrate for graph_boost / related-
 *     entity expansion. A learned weight on top sharpens that traversal.
 *
 * Strength is NUMERIC (not integer) because the update rule caps via
 * LEAST(strength + eta, cap) and read-time decay multiplies by a fractional
 * exponential factor. Lex canonicalization (entity_a_id < entity_b_id)
 * prevents (a,b)/(b,a) dupes.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('entity_hebbian_edge', (table) => {
    table.bigInteger('entity_a_id').notNullable().references('id').inTable('entity').onDelete('CASCADE');
    table.bigInteger('entity_b_id').notNullable().references('id').inTable('entity').onDelete('CASCADE');
    table.decimal('strength', 12, 4).notNullable().defaultTo(1);
    table.timestamp('first_seen_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['entity_a_id', 'entity_b_id']);
  });

  await knex.raw(`
    ALTER TABLE entity_hebbian_edge
    ADD CONSTRAINT entity_hebbian_edge_canonical_order
    CHECK (entity_a_id < entity_b_id)
  `);

  await knex.raw(`CREATE INDEX entity_hebbian_edge_a_idx ON entity_hebbian_edge (entity_a_id, strength DESC)`);
  await knex.raw(`CREATE INDEX entity_hebbian_edge_b_idx ON entity_hebbian_edge (entity_b_id, strength DESC)`);
};

exports.down = async function (knex) {
  await knex.schema.dropTable('entity_hebbian_edge');
};
