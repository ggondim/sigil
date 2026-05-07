/**
 * Upgrade embedding columns from vector(768) → vector(N) where N >= 1024.
 *
 * CONDITIONAL: only runs when EMBEDDING_DIMENSIONS env >= 1024. The default
 * (unset or 768) is the Ollama nomic-embed-text dimension; bumping the schema
 * to 1024 there would mismatch the embedder and break ingest.
 *
 * Activates when an operator opts into a 1024d-class model (Voyage 3-large,
 * OpenAI text-embedding-3-large truncated to 1024d, bge-large-en-v1.5).
 * They set EMBEDDING_DIMENSIONS=1024 (or higher) and re-run sigil migrate.
 *
 * REFUSES TO RUN if any embedding row exists — changing the column type
 * would invalidate stored embeddings. Operators upgrading an existing DB:
 *   1. sigil export to back up
 *   2. sigil reset --confirm
 *   3. set EMBEDDING_DIMENSIONS=1024 in ~/.sigil/.env
 *   4. sigil migrate
 *   5. re-ingest with the new embedding model
 */

const TABLES = ['chunk', 'fact', 'entity', 'embedding_cache'];
const DEFAULT_DIM = 768;

exports.up = async function (knex) {
  const targetDim = Number(process.env.EMBEDDING_DIMENSIONS) || DEFAULT_DIM;

  if (targetDim <= DEFAULT_DIM) {
    // No-op for the default 768d (local nomic). Migration is recorded as
    // applied so it doesn't keep trying on every sigil migrate.
    return;
  }

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
