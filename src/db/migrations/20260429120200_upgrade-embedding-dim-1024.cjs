/**
 * Bring all embedding columns to vector(1024) — Sigil's fixed embedding
 * dimension (see src/lib/constants.js EMBEDDING_DIM).
 *
 * The dimension is no longer configurable. Every provider/model is pinned to
 * (or truncated to) 1024, and the schema is created at 1024 unconditionally,
 * so the database and the embedder can never drift apart. Hardcoded here
 * because .cjs migrations can't import the ESM constant.
 *
 * REFUSES TO RUN if any embedding row exists — changing the column type would
 * invalidate stored embeddings. (On a fresh setup the tables are empty, so
 * this is a no-op guard.)
 */

const TABLES = ['chunk', 'fact', 'entity', 'embedding_cache'];
const DEFAULT_DIM = 768;
const TARGET_DIM = 1024; // = EMBEDDING_DIM

exports.up = async function (knex) {
  const targetDim = TARGET_DIM;

  // Safety check — bail loudly if existing embeddings would be invalidated.
  for (const table of TABLES) {
    const { rows } = await knex.raw(`SELECT COUNT(*)::int AS c FROM ${table} WHERE embedding IS NOT NULL`);
    const count = rows[0].c;
    if (count > 0) {
      throw new Error(
        `Cannot upgrade embedding dim to ${targetDim}: ${table} has ${count} rows with existing embeddings. ` +
        `Run 'sigil export' to back up, then 'sigil reset --confirm' to wipe, then re-migrate ` +
        `and re-ingest with the new embedding model.`,
      );
    }
  }

  for (const table of TABLES) {
    await knex.raw(`ALTER TABLE ${table} ALTER COLUMN embedding TYPE vector(${targetDim}) USING embedding::vector(${targetDim})`);
    // embedding_cache doesn't have an HNSW index — it's a key-value store keyed on sha256.
    if (table === 'embedding_cache') continue;
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw ((embedding::halfvec(${targetDim})) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }
};

exports.down = async function (knex) {
  // The down migration always reverts to 768d — it's the lowest common
  // denominator and matches the prior halfvec migration's index.
  for (const table of TABLES) {
    await knex.raw(`ALTER TABLE ${table} ALTER COLUMN embedding TYPE vector(${DEFAULT_DIM}) USING NULL`);
    if (table === 'embedding_cache') continue;
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw ((embedding::halfvec(${DEFAULT_DIM})) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }
};
