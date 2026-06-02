/**
 * Local-Postgres driver: builds a pg connection from the discrete
 * SIGIL_DB_HOST / PORT / NAME / USER / PASSWORD env vars. This is the
 * original Sigil behavior and remains the default when no URL is set.
 */
export function buildLocalConnection(config) {
  return {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
  };
}

/**
 * Build a pg connection from discrete fields (with sigil defaults). Used by
 * setup steps that have host/port/db/user/password directly rather than a
 * `config`-shaped object.
 */
export function buildLocalConnectionFromFields({ host = 'localhost', port = 5432, database = 'sigil', user = 'sigil_app', password = '' } = {}) {
  return { host, port: Number(port) || 5432, database, user, password };
}
