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
