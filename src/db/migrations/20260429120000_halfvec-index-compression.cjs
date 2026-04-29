/**
 * Halfvec compression for HNSW indexes (Ogham §"Halfvec compression").
 *
 * The embedding columns stay as vector(768) (float32), but the HNSW index
 * casts to halfvec(768) (float16). ~50% index size reduction with negligible
 * quality loss — the cosine distance computation has more than enough
 * precision at fp16 for retrieval ranking.
 *
 * Why not change the column type? Because storing as float32 keeps room for
 * higher-precision operations (exact distance, future re-indexing strategies)
 * while the HNSW index only needs distance ordering, where fp16 is fine.
 */

const TABLES = ['chunk', 'fact', 'entity'];

exports.up = async function (knex) {
  for (const table of TABLES) {
    // Drop the old plain-vector HNSW index
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    // Recreate with halfvec cast
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }
};

exports.down = async function (knex) {
  for (const table of TABLES) {
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw (embedding vector_cosine_ops)`,
    );
  }
};
