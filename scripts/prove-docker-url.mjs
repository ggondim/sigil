/**
 * Prove the docker + url (external) paths of the Database step.
 *   node scripts/prove-docker-url.mjs
 */
import assert from 'node:assert';
import { userInfo } from 'node:os';

import pg from 'pg';

import { apply, detect } from '../src/setup/steps/database.js';
import { buildUrlConnection } from '../src/db/drivers/index.js';
import { detectDocker, removeLocalPostgres } from '../src/db/provision/docker.js';
import { getConfig, resetConfig } from '../src/setup/config-store.js';

const HOST = '127.0.0.1';
const PORT = 5433;
const USER = userInfo().username;
const log = (...a) => console.log(...a);

async function adminClient(db) {
  const c = new pg.Client({ host: HOST, port: PORT, database: db, user: USER });
  await c.connect();
  return c;
}
async function dimsForUrl(url) {
  const c = new pg.Client(buildUrlConnection(url));
  await c.connect();
  try {
    const r = await c.query(
      `select c.relname rel, format_type(a.atttypid, a.atttypmod) ft
         from pg_attribute a join pg_class c on a.attrelid=c.oid
        where c.relname in ('fact','chunk','entity','embedding_cache') and a.attname='embedding'`,
    );
    return r.rows.map((x) => `${x.rel}:${x.ft}`);
  } finally { try { await c.end(); } catch { /* */ } }
}

// ── URL / external path: create-db-if-missing + enable pgvector + migrate ─────
log('\n[URL] external connection string — create db, enable pgvector, migrate');
const URL_DB = 'sigil_url_prove';
const externalUrl = `postgres://${USER}@${HOST}:${PORT}/${URL_DB}`;
{
  const a = await adminClient('postgres');
  await a.query(`DROP DATABASE IF EXISTS ${URL_DB} WITH (FORCE)`).catch(() => {});
  await a.end();
}
resetConfig();
const urlRes = await apply({ mode: 'url', url: externalUrl }, (p) => log(`   … ${p.pct}%  ${p.label}`));
log('   result:', JSON.stringify(urlRes));
const urlDims = await dimsForUrl(externalUrl);
log('   embedding columns:', urlDims.join(', '));
assert(urlDims.length === 4 && urlDims.every((d) => d.endsWith(':vector(1024)')), 'url db should be vector(1024)');
assert.equal(getConfig().database.mode, 'url');
assert.equal(getConfig().database.url, externalUrl);
log('   ✓ external path: db created from scratch, pgvector enabled, migrated to 1024, config persisted');
{
  const a = await adminClient('postgres');
  await a.query(`DROP DATABASE IF EXISTS ${URL_DB} WITH (FORCE)`);
  await a.end();
}
log('   ✓ cleaned up sigil_url_prove');

// ── Docker path: spin up the dedicated sigil-postgres container ───────────────
log('\n[Docker] spin up dedicated sigil-postgres container + migrate');
const dk = await detectDocker({ refresh: true });
assert(dk.available, `docker should be available: ${dk.reason}`);
log('   docker version:', dk.version);
resetConfig();
const dRes = await apply({ mode: 'docker' }, (p) => log(`   … ${p.pct}%  ${p.label}`));
log('   result:', JSON.stringify({ ...dRes, url: dRes.url.replace(/:[^:@]+@/, ':<pw>@') }));
const dDims = await dimsForUrl(dRes.url);
log('   embedding columns:', dDims.join(', '));
assert(dDims.length === 4 && dDims.every((d) => d.endsWith(':vector(1024)')), 'docker db should be vector(1024)');
assert.equal(getConfig().database.mode, 'docker');
log('   ✓ docker path: container provisioned, pgvector image, migrated to 1024, config persisted');

log('   cleaning up the test container (removing sigil-postgres + volume)…');
await removeLocalPostgres({ deleteVolume: true });
log('   ✓ removed test container');

resetConfig();
log('\nDOCKER + URL PROOFS PASSED ✅\n');
process.exit(0);
