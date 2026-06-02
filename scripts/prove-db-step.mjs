/**
 * Manual prove-out for the Database setup step. Run against a real local
 * Postgres. NOT committed as a test — it's an end-to-end smoke harness.
 *
 *   node scripts/prove-db-step.mjs
 */
import assert from 'node:assert';
import { userInfo } from 'node:os';
import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { detect, apply } from '../src/setup/steps/database.js';
import { ensurePostgresDatabase, probeSigilConnection } from '../src/db/setup.js';
import { runMigrationsOn } from '../src/db/migrate.js';
import { getConfig, resetConfig } from '../src/setup/config-store.js';

const HOST = '127.0.0.1';
const PORT = 5433;          // this machine's brew PG runs here (not 5432)
const USER = userInfo().username;
const log = (...a) => console.log(...a);

async function adminClient(db) {
  const c = new pg.Client({ host: HOST, port: PORT, database: db, user: USER });
  await c.connect();
  return c;
}

// ── 1. detect() ──────────────────────────────────────────────────────────────
log('\n[1] detect() — should find PG on the non-standard 5433 + pgvector');
const d = await detect();
log('   local :', JSON.stringify(d.local));
log('   docker:', JSON.stringify(d.docker));
assert(d.local.running, 'expected a running local Postgres');
assert.equal(d.local.port, PORT, `expected detection on ${PORT}`);
assert(d.local.pgvectorAvailable, 'expected pgvector available');
log('   ✓ detected local Postgres on port', d.local.port, '— pgvector available');

// ── 2. fresh create + migrate → vector(1024), on a throwaway db ──────────────
log('\n[2] fresh create + migrate + pgvector round-trip (sigil_prove, dropped after)');
const PROVE_DB = 'sigil_prove';
const PROVE_USER = 'sigil_prove_app';
const pw = randomBytes(12).toString('base64url');

{
  const a = await adminClient('postgres');
  await a.query(`DROP DATABASE IF EXISTS ${PROVE_DB} WITH (FORCE)`).catch(() => {});
  await a.query(`DROP ROLE IF EXISTS ${PROVE_USER}`).catch(() => {});
  await a.end();
}

await ensurePostgresDatabase({
  admin: { host: HOST, port: PORT, user: USER, password: '' },
  sigil: { database: PROVE_DB, user: PROVE_USER, password: pw },
});
const m = await runMigrationsOn({ host: HOST, port: PORT, database: PROVE_DB, user: PROVE_USER, password: pw });
log('   migrations applied:', m.ran.length);
assert(m.ran.length >= 30, 'expected the full migration set to run on a fresh db');

{
  const c = await adminClient(PROVE_DB);
  const r = await c.query(
    `select c.relname rel, format_type(a.atttypid, a.atttypmod) ft
       from pg_attribute a join pg_class c on a.attrelid = c.oid
      where c.relname in ('fact','chunk','entity','embedding_cache') and a.attname='embedding'`,
  );
  log('   embedding columns:', r.rows.map((x) => `${x.rel}:${x.ft}`).join(', '));
  assert(r.rows.length === 4, 'expected 4 embedding columns');
  for (const row of r.rows) assert.equal(row.ft, 'vector(1024)', `${row.rel} should be vector(1024), got ${row.ft}`);
  await c.end();
}

{
  // least-privilege user does a real 1024-d pgvector round-trip
  const app = new pg.Client({ host: HOST, port: PORT, database: PROVE_DB, user: PROVE_USER, password: pw });
  await app.connect();
  const vec = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
  await app.query(
    `insert into embedding_cache (key, provider, model, embedding, hits, created_at, last_used_at)
     values ('provekey','prove','prove',$1::vector,0,now(),now())`,
    [vec],
  );
  const got = await app.query("select vector_dims(embedding) dims from embedding_cache where key='provekey'");
  assert.equal(got.rows[0].dims, 1024, 'round-tripped vector should be 1024-d');
  await app.end();
  log('   ✓ 1024-d vector inserted + read back by least-priv user');
}

const probe = await probeSigilConnection({ host: HOST, port: PORT, database: PROVE_DB, user: PROVE_USER, password: pw });
assert(probe.ok, `sigil_prove_app should connect: ${probe.message}`);

{
  const a = await adminClient('postgres');
  await a.query(`DROP DATABASE IF EXISTS ${PROVE_DB} WITH (FORCE)`);
  await a.query(`DROP ROLE IF EXISTS ${PROVE_USER}`);
  await a.end();
}
log('   ✓ fresh-creation path verified, throwaway db dropped');

// ── 3. step apply() end-to-end (reuses real sigil db, non-destructive) ───────
log('\n[3] apply({mode:local, port:5433}) — orchestration + config.json persistence');
resetConfig();
const res = await apply(
  { mode: 'local', host: 'localhost', port: PORT, adminUser: USER },
  (p) => log(`     … ${p.pct}%  ${p.label}`),
);
log('   result:', JSON.stringify(res));
const cfg = getConfig();
log('   persisted config.database:', JSON.stringify({ ...cfg.database, password: cfg.database.password ? '<set>' : null }));
assert.equal(cfg.database.mode, 'local');
assert.equal(cfg.database.port, PORT);
assert.equal(cfg.database.user, 'sigil_app');
assert(cfg.database.password, 'expected a generated sigil_app password in config');
assert.equal(cfg.setup.steps.database ?? 'n/a', 'n/a'); // step status is set by the service, not apply()
log('   ✓ step ran end-to-end and persisted the connection');

log('\nALL DB-STEP PROOFS PASSED ✅\n');
process.exit(0);
