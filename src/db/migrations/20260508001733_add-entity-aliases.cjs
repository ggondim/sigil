/**
 * Add an `aliases` text-array column to the entity table.
 *
 * Why: AUDM and the existing 3-stage entity resolver both fail on entity
 * renames ("Smara is now named Sigil") because the rename's vector
 * similarity to existing facts about Smara is too low to trigger any
 * dedup. The structural fix is to track entity identity at the entity
 * layer (stable UUIDs surviving renames) and let facts reference those
 * UUIDs via fact_entity. When a rename is detected, the canonical
 * `name` rolls forward and the old name lands in `aliases[]` so that:
 *
 *   1. Future ingests mentioning the old name still resolve to the
 *      same entity row (alias-aware lookup in findByName).
 *   2. Search-time graph traversal pulls historical facts via the
 *      stable entity_id even though their text still mentions the
 *      old name.
 *
 * Defaults to '{}' so all existing rows have a sensible empty value.
 * Indexed via a GIN expression on the lowercased array so case-
 * insensitive lookup is fast.
 */

exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE entity
    ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}'::text[]
  `);

  // Aliases are stored already lowercased by the resolver (push only happens
  // via pushAlias() which lowercases at the boundary), so a plain GIN index
  // on the array is sufficient. PGlite rejects subqueries in expression
  // indexes, so we can't transform at index time — pre-lowercasing is the
  // simpler contract.
  await knex.raw(`
    CREATE INDEX entity_aliases_idx ON entity USING GIN (aliases)
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS entity_aliases_idx`);
  await knex.raw(`ALTER TABLE entity DROP COLUMN IF EXISTS aliases`);
};
