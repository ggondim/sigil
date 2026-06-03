/**
 * Reset / clean-rebuild helpers, shared by the GUI (setup.factoryReset RPC) and
 * the CLI (`sigil reset`).
 *
 *   - disconnectAllClients() — remove Sigil's hooks/config from every connected
 *     coding agent (claude-code, cursor, …).
 *   - wipeMemoryData()       — TRUNCATE every memory table (keeps schema, so a
 *     fresh setup re-migrates cleanly). Runs in the daemon (uses its pool).
 *   - dropConfiguredDatabase() — destroy the DB itself: remove the Docker
 *     container+volume, or DROP DATABASE for a local install. External/managed
 *     URLs are left alone (not ours to drop) — reported back to the caller.
 *   - factoryReset()         — the in-app reset: disconnect + optional memory
 *     wipe + config wipe.
 */
import { getConfig, resetConfig } from './config-store.js';

/** Remove Sigil from every coding agent it's installed into. */
export async function disconnectAllClients() {
  const { listClients } = await import('../lib/clients/index.js');
  const clients = await listClients();
  const removed = [];
  for (const c of clients) {
    try {
      const v = await c.verify();
      if (v.installed) { await c.uninstall({ dryRun: false }); removed.push(c.id); }
    } catch { /* best-effort per client */ }
  }
  return removed;
}

/** TRUNCATE all memory tables (everything except knex migration bookkeeping). */
export async function wipeMemoryData() {
  const { default: cortexDb } = await import('../db/cortex.js');
  const { rows } = await cortexDb.raw(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'knex\\_%'",
  );
  const tables = rows.map((r) => r.tablename);
  if (!tables.length) return 0;
  await cortexDb.raw(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  return tables.length;
}

/**
 * Destroy the configured database. Reads config BEFORE it's wiped.
 *   docker → remove the sigil-postgres container + its volume
 *   local  → DROP DATABASE (connect to the maintenance db as the OS user)
 *   url    → left intact (managed/user-owned); reported as skipped
 * @returns {Promise<{ kind, dropped: boolean, detail: string }>}
 */
export async function dropConfiguredDatabase() {
  const cfg = getConfig();
  const mode = cfg.database?.mode;

  if (mode === 'docker') {
    const { removeLocalPostgres } = await import('../db/provision/docker.js');
    await removeLocalPostgres({ deleteVolume: true });
    return { kind: 'docker', dropped: true, detail: 'removed sigil-postgres container + volume' };
  }

  if (mode === 'local') {
    const pg = (await import('pg')).default;
    const { userInfo } = await import('node:os');
    const name = cfg.database.name || 'sigil';
    const admin = new pg.Client({
      host: cfg.database.host || 'localhost',
      port: cfg.database.port || 5432,
      database: 'postgres',
      user: cfg.database.adminUser || userInfo().username,
      password: '',
    });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}" WITH (FORCE)`);
      return { kind: 'local', dropped: true, detail: `dropped database "${name}"` };
    } finally {
      try { await admin.end(); } catch { /* */ }
    }
  }

  return { kind: mode || 'none', dropped: false, detail: 'external/managed database left intact' };
}

/**
 * In-app reset (GUI). Disconnect agents, optionally wipe stored memory, wipe
 * config. Leaves the daemon running on its current pool; the GUI then returns
 * to setup. Does NOT drop the database (use the CLI `sigil reset --wipe-db` for
 * a full teardown that also destroys the DB).
 */
export async function factoryReset({ wipeMemory = true } = {}) {
  const disconnected = await disconnectAllClients();
  let tablesWiped = 0;
  if (wipeMemory) {
    try { tablesWiped = await wipeMemoryData(); } catch { /* DB may be unreachable; config wipe still proceeds */ }
  }
  resetConfig();
  return { disconnected, tablesWiped, configWiped: true };
}
