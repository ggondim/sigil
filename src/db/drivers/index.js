/**
 * DB driver selection.
 *
 *   - If SIGIL_DATABASE_URL or DATABASE_URL is set, use the URL driver
 *     (Neon, Supabase, RDS, Render, Railway, self-hosted, etc.).
 *   - Otherwise, use the local-postgres driver (back-compat with the
 *     SIGIL_DB_HOST / PORT / NAME / USER / PASSWORD env vars).
 *
 * Returns a pg-shape connection object suitable for passing to knex's
 * `connection` field. Pool config and post-processing are applied by
 * the caller (cortex.js).
 */
import { buildLocalConnection, buildLocalConnectionFromFields } from './local-postgres.js';
import { buildUrlConnection, classifyProvider } from './url.js';

export function selectDriver(config) {
  const url = config.db.url;
  if (url) {
    return {
      kind: 'url',
      provider: classifyProvider(url),
      connection: normalizeConnection(buildUrlConnection(url)),
    };
  }
  return {
    kind: 'local',
    provider: 'local',
    connection: normalizeConnection(buildLocalConnection(config)),
  };
}

// pg throws "SASL: client password must be a string" if password is null/
// undefined. Coerce credentials to strings so a missing value degrades to a
// clear auth error (or a no-password connect) instead of a cryptic SASL crash.
function normalizeConnection(conn) {
  if (conn.password == null) conn.password = '';
  if (conn.user == null) delete conn.user;
  return conn;
}

export { buildLocalConnection, buildLocalConnectionFromFields, buildUrlConnection, classifyProvider };
