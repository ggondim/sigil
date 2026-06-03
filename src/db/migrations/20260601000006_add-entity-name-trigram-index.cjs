/**
 * Trigram index for entity name search.
 *
 * entities/store.js searchByName() runs `WHERE LOWER(name) LIKE '%q%'` on
 * every search for short queries. A leading-wildcard LIKE can't use a normal
 * B-tree index, so this was a sequential scan of the entity table that grew
 * linearly with memory size. A GIN trigram index on LOWER(name) turns it into
 * an index scan.
 *
 * The index expression must match the query expression exactly (LOWER(name)),
 * otherwise the planner won't use it.
 */
exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS entity_name_trgm_idx
      ON entity USING GIN (LOWER(name) gin_trgm_ops)
  `);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS entity_name_trgm_idx');
  // Leave the pg_trgm extension installed — other indexes or queries may rely
  // on it, and dropping a shared extension on rollback is surprising.
};
