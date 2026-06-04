/**
 * DB driver selection.
 *
 *   - If db.mode === 'embedded' (or SIGIL_DB_MODE=embedded), use the in-process
 *     PGlite engine — a full Postgres 17 + pgvector compiled to WASM, no server,
 *     no Docker, no prerequisites. Data lives at ~/.sigil/db.
 *   - Else if SIGIL_DATABASE_URL or DATABASE_URL is set, use the URL driver
 *     (Neon, Supabase, RDS, Render, Railway, self-hosted, etc.).
 *   - Otherwise, use the local-postgres driver (back-compat with the
 *     SIGIL_DB_HOST / PORT / NAME / USER / PASSWORD env vars).
 *
 * Returns a descriptor: { kind, provider, connection, client }. `connection` is
 * a pg-shape object for the URL/local drivers, or { pglitePath } for embedded.
 * `client` is 'pg' for server-backed Postgres or the ClientPGlite dialect class
 * for embedded — passed straight to knex({ client }). Pool config and
 * post-processing are applied by the caller (cortex.js).
 */
import { buildLocalConnection, buildLocalConnectionFromFields } from './local-postgres.js';
import { buildUrlConnection, classifyProvider } from './url.js';
// Cheap to import: the adapter only pulls knex's pg dialect at module load and
// defers the actual @electric-sql/pglite import to first connection.
import { ClientPGlite, PGLITE_DB_PATH } from '../pglite-adapter.js';

export function selectDriver(config) {
  if (config.db.mode === 'embedded') {
    return {
      kind: 'embedded',
      provider: 'pglite',
      client: ClientPGlite,
      connection: { pglitePath: process.env.SIGIL_PGLITE_PATH || PGLITE_DB_PATH },
    };
  }
  const url = config.db.url;
  if (url) {
    return {
      kind: 'url',
      provider: classifyProvider(url),
      connection: normalizeConnection(buildUrlConnection(url)),
      client: 'pg',
    };
  }
  return {
    kind: 'local',
    provider: 'local',
    connection: normalizeConnection(buildLocalConnection(config)),
    client: 'pg',
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
