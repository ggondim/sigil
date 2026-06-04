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
import { migrateEmbedded } from '../../db/migrate.js';
import { PGLITE_DB_PATH } from '../../db/pglite-adapter.js';
import { StepError, fromError, persistDatabase } from './shared.js';

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
