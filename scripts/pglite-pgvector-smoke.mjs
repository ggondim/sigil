/**
 * Empirical proof: PGlite can run pgvector at Sigil's 1024-dim, in THIS repo.
 * Mirrors what Sigil's migrations need: CREATE EXTENSION vector, a vector(1024)
 * column, a halfvec(1024) column + HNSW index (the compression migration uses
 * halfvec), and a cosine-distance ORDER BY similarity query.
 *
 * Run: node scripts/pglite-pgvector-smoke.mjs
 * Uses an in-memory PGlite so it leaves nothing on disk.
 */
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

const DIM = 1024;

function randVec(seed) {
  // deterministic-ish pseudo vector (no Math.random needed)
  const a = [];
  let x = seed;
  for (let i = 0; i < DIM; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    a.push(((x % 2000) - 1000) / 1000);
  }
  return `[${a.join(',')}]`;
}

const db = new PGlite({ extensions: { vector } });
await db.waitReady;

const out = (label, v) => console.log(`  ${label.padEnd(34)} ${v}`);
console.log('PGlite + pgvector smoke test');
console.log('────────────────────────────');

const v = await db.query('select version()');
out('engine', v.rows[0].version.split(',')[0]);

await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');
const ext = await db.query("select extversion from pg_extension where extname='vector'");
out('pgvector extversion', ext.rows[0]?.extversion ?? 'MISSING');

// vector(1024) + halfvec(1024) — the exact types Sigil's later migrations use.
await db.exec(`
  CREATE TABLE mem (
    id        bigserial primary key,
    content   text,
    embedding vector(${DIM}),
    embed_h   halfvec(${DIM})
  );
`);
out('vector(1024) column', 'created');
out('halfvec(1024) column', 'created');

// HNSW index on halfvec with cosine ops — mirrors the compression migration.
await db.exec('CREATE INDEX ON mem USING hnsw (embed_h halfvec_cosine_ops);');
out('HNSW halfvec_cosine_ops index', 'created');

// Insert rows.
for (let i = 1; i <= 5; i++) {
  const vec = randVec(i * 7);
  await db.query(
    'INSERT INTO mem (content, embedding, embed_h) VALUES ($1, $2, $3)',
    [`fact ${i}`, vec, vec],
  );
}
out('rows inserted', '5');

// Cosine-distance similarity query (the read path Sigil's recall uses).
const probe = randVec(7); // identical to row 1's seed → should rank first
const sim = await db.query(
  `SELECT id, content, 1 - (embed_h <=> $1::halfvec) AS score
     FROM mem ORDER BY embed_h <=> $1::halfvec LIMIT 3`,
  [probe],
);
console.log('  top-3 by cosine similarity:');
for (const r of sim.rows) console.log(`     #${r.id} ${r.content}  score=${Number(r.score).toFixed(4)}`);

const pass = ext.rows[0]?.extversion && sim.rows[0].id === 1;
console.log('────────────────────────────');
console.log(pass ? '✅ PASS — pgvector works in PGlite at 1024 dims (vector + halfvec + HNSW)'
                 : '❌ FAIL');
await db.close();
process.exit(pass ? 0 : 1);
