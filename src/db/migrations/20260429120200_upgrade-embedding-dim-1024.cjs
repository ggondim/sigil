/**
 * Upgrade embedding columns from vector(768) → vector(1024).
 *
 * Voyage-3-large outputs 1024 dimensions natively. To use it (or other 1024d
 * models like bge-large-en-v1.5) without quality loss from truncation, the
 * schema needs to match.
 *
 * REFUSES TO RUN if any embedding row exists, because changing the column type
 * would invalidate stored embeddings. Operators upgrading an existing DB must:
 *   1. Export their data (cortex export)
 *   2. cortex reset --confirm
 *   3. cortex migrate
 *   4. Re-ingest with the new embedding model
 *
 * For greenfield DBs (the eval harness, fresh installs), this runs cleanly.
 */

const TABLES = ['chunk', 'fact', 'entity', 'embedding_cache'];
const NEW_DIM = 1024;

exports.up = async function (knex) {
  // Safety check — bail loudly if existing embeddings would be invalidated.
  for (const table of TABLES) {
    const { rows } = await knex.raw(`SELECT COUNT(*)::int AS c FROM ${table} WHERE embedding IS NOT NULL`);
    const count = rows[0].c;
    if (count > 0) {
      throw new Error(
        `Cannot upgrade embedding dim: ${table} has ${count} rows with existing embeddings. ` +
        `Run 'cortex export' to back up, then 'cortex reset --confirm' to wipe, then re-migrate ` +
        `and re-ingest with the new embedding model. ` +
        `(Or skip this migration if you're staying at 768d.)`,
      );
    }
  }

  for (const table of TABLES) {
    await knex.raw(`ALTER TABLE ${table} ALTER COLUMN embedding TYPE vector(${NEW_DIM}) USING embedding::vector(${NEW_DIM})`);
    // embedding_cache doesn't have an HNSW index — it's a key-value store keyed on sha256.
    if (table === 'embedding_cache') continue;
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw ((embedding::halfvec(${NEW_DIM})) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }
};

exports.down = async function (knex) {
  for (const table of TABLES) {
    await knex.raw(`ALTER TABLE ${table} ALTER COLUMN embedding TYPE vector(768) USING NULL`);
    if (table === 'embedding_cache') continue;
    await knex.raw(`DROP INDEX IF EXISTS ${table}_embedding_idx`);
    await knex.raw(
      `CREATE INDEX ${table}_embedding_idx ON ${table} USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    );
  }
};
