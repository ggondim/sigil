/**
 * Embedded-database service (PGlite).
 *
 * The zero-prerequisite path: no Postgres install, no Docker, no connection
 * string. A full Postgres 17 + pgvector compiled to WebAssembly runs in-process
 * and persists to ~/.sigil/db. This provisioner just records the mode and runs
 * the migrations against the in-process engine.
 *
 * Single-process caveat: PGlite can only be opened by ONE process at a time. In
 * Sigil that owner is the daemon (the CLI and hooks reach the DB through it over
 * the Unix socket), so the constraint holds — but a direct-DB CLI path (e.g.
 * `sigil migrate`) must run while the daemon is stopped, or go through it.
 */
import { existsSync } from 'node:fs';

import { migrateEmbedded } from '../../db/migrate.js';
import { PGLITE_DB_PATH } from '../../db/pglite-adapter.js';
import { StepError, fromError, persistDatabase } from './shared.js';

/**
 * Self-heal a stale ~/.sigil/db before migrating. A data dir left by an older
 * PGlite/Postgres version, copied from another device, or half-written by a
 * crash aborts the WASM engine ("Aborted()") on the first catalog query — which
 * is exactly what a fresh bundled-DB setup hits after a GUI reset that didn't
 * clear it. Release any in-process handle, verify the dir actually opens, and
 * recreate it if not — turning that dead end into a clean rebuild.
 */
async function ensureUsableEmbeddedDir(emit) {
  // Drop any live handle (daemon pool + PGlite singleton) bound to this dir — a
  // second concurrent opener would itself violate PGlite's one-process rule.
  const { resetCortexPool } = await import('../../db/cortex.js');
  await resetCortexPool();
  if (!existsSync(PGLITE_DB_PATH)) return;
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const { vector } = await import('@electric-sql/pglite/vector');
    const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
    const probe = new PGlite(`file://${PGLITE_DB_PATH}`, { extensions: { vector, pg_trgm } });
    await probe.waitReady;
    await probe.query('select 1');
    await probe.close();
  } catch {
    emit({ pct: 30, label: 'Existing built-in database is unreadable — recreating…' });
    const { rm } = await import('node:fs/promises');
    await rm(PGLITE_DB_PATH, { recursive: true, force: true });
  }
}

/**
 * @param {object} _input  unused — embedded mode takes no connection fields
 * @param {(p:{pct:number,label:string})=>void} emit  progress sink
 */
export async function provisionEmbedded(_input = {}, emit = () => {}) {
  try {
    // Persist mode FIRST so any later cortex.js import in this process builds an
    // embedded pool (selectDriver reads db.mode live from the config store).
    emit({ pct: 10, label: 'Configuring the in-process database…' });
    persistDatabase({ mode: 'embedded', url: null, password: null });

    // Make sure the on-disk engine actually opens before we migrate — recreate a
    // version-incompatible / corrupt dir rather than aborting the WASM engine.
    emit({ pct: 25, label: 'Checking the in-process database…' });
    await ensureUsableEmbeddedDir(emit);

    emit({ pct: 40, label: 'Creating tables (Postgres + pgvector, no server)…' });
    const m = await migrateEmbedded();

    emit({ pct: 100, label: 'Embedded database ready.' });
    return {
      mode: 'embedded',
      engine: 'pglite',
      dataDir: PGLITE_DB_PATH,
      migrationsRan: m.ran.length,
    };
  } catch (err) {
    throw err instanceof StepError ? err : fromError(err);
  }
}
