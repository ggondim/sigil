/**
 * Run knex migrations against an arbitrary connection — a plain function so
 * setup steps can migrate a freshly-created database without going through the
 * daemon's pool or the runMigrations RPC. Pooled (PgBouncer) URLs are rewritten
 * to their direct endpoint, since advisory locks / prepared statements that
 * migrations need don't work through a transaction pooler.
 */
import knexFactory from 'knex';

import { MIGRATIONS_DIR } from '../lib/paths.js';
import { buildUrlConnection, buildLocalConnectionFromFields } from './drivers/index.js';
import { isPooledUrl, directMigrationUrl } from './drivers/url.js';

/**
 * @param {{url?: string} | {host: string, port?: number, database?: string, user?: string, password?: string}} spec
 * @returns {Promise<{ batchNo: number, ran: string[] }>}
 */
export async function runMigrationsOn(spec) {
  let connection;
  if (spec.url) {
    let migrateUrl = spec.url;
    if (isPooledUrl(spec.url)) {
      const direct = directMigrationUrl(spec.url);
      if (!direct) {
        throw new Error(
          'This is a connection-pooler URL. Migrations need the direct connection — '
          + 'paste your non-pooled connection string.',
        );
      }
      migrateUrl = direct;
    }
    connection = buildUrlConnection(migrateUrl);
  } else {
    connection = buildLocalConnectionFromFields(spec);
  }

  const knex = knexFactory({ client: 'pg', connection, pool: { min: 1, max: 2 } });
  try {
    const [batchNo, ran] = await knex.migrate.latest({ directory: MIGRATIONS_DIR });
    return { batchNo, ran };
  } finally {
    await knex.destroy();
  }
}

/**
 * Run migrations against the in-process PGlite engine (embedded mode).
 *
 * Deliberately does NOT destroy() the knex instance: PGlite is a process-wide
 * singleton (src/db/pglite-adapter.js) shared with the daemon's cortex pool, and
 * destroy() would close it and break every later query. PGlite flushes to disk
 * on write and is released on process exit. pool.max:1 because PGlite is
 * single-connection — a larger pool just multiplexes onto the one engine.
 *
 * @returns {Promise<{ batchNo: number, ran: string[] }>}
 */
export async function migrateEmbedded() {
  const { ClientPGlite, PGLITE_DB_PATH } = await import('./pglite-adapter.js');
  const knex = knexFactory({
    client: ClientPGlite,
    connection: { pglitePath: PGLITE_DB_PATH },
    pool: { min: 1, max: 1 },
  });
  const [batchNo, ran] = await knex.migrate.latest({ directory: MIGRATIONS_DIR });
  return { batchNo, ran };
}
