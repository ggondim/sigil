/**
 * URL driver: turns a Postgres connection URL into pg-shape config.
 *
 * Provider hints:
 *   - Neon       (*.neon.tech)              → SSL required, root CA trust default
 *   - Supabase   (*.supabase.co | pooler)    → SSL required
 *   - AWS RDS    (*.rds.amazonaws.com)       → SSL required (AWS root)
 *   - Render     (*.render.com)              → SSL required
 *   - Railway    (*.railway.app)             → SSL required
 *   - localhost / 127.0.0.1 / *.local        → no SSL by default
 *
 * Explicit sslmode in the URL query string wins:
 *   sslmode=disable     → no SSL
 *   sslmode=require     → SSL, rejectUnauthorized=true
 *   sslmode=no-verify   → SSL, rejectUnauthorized=false (compatibility for self-signed)
 *   sslmode=verify-full → SSL, rejectUnauthorized=true
 *
 * Falls back to provider heuristics if sslmode is absent.
 */

const REQUIRE_SSL_HOSTS = [
  /\.neon\.tech$/i,
  /\.supabase\.co$/i,
  /\.supabase\.com$/i,
  /\.pooler\.supabase\.com$/i,
  /\.rds\.amazonaws\.com$/i,
  /\.render\.com$/i,
  /\.railway\.app$/i,
  /\.cockroachlabs\.cloud$/i,
];

const NO_SSL_HOSTS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^::1$/,
  /\.local$/i,
];

export function buildUrlConnection(url) {
  if (!url) {
    throw new Error('url driver: SIGIL_DATABASE_URL is empty');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new Error(`url driver: invalid URL — ${err.message}`);
  }

  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new Error(`url driver: expected postgres:// or postgresql:// scheme, got ${parsed.protocol}`);
  }

  const sslmode = parsed.searchParams.get('sslmode');
  const ssl = resolveSsl(parsed.hostname, sslmode);

  // pg accepts a connectionString directly, but we expand into discrete
  // fields so knex can inject pool/post-process config alongside it.
  const conn = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
  if (ssl !== undefined) conn.ssl = ssl;

  // Application name surfaces in Postgres logs / pg_stat_activity — useful
  // for ops to identify Sigil connections vs other clients on a shared DB.
  if (!parsed.searchParams.get('application_name')) {
    conn.application_name = 'sigil';
  }

  return conn;
}

function resolveSsl(hostname, sslmode) {
  if (sslmode === 'disable') return false;
  if (sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca') {
    return { rejectUnauthorized: true };
  }
  if (sslmode === 'no-verify' || sslmode === 'prefer') {
    return { rejectUnauthorized: false };
  }
  // Heuristics (no explicit sslmode set)
  if (NO_SSL_HOSTS.some((re) => re.test(hostname))) return undefined;
  if (REQUIRE_SSL_HOSTS.some((re) => re.test(hostname))) return { rejectUnauthorized: true };
  // Unknown remote host: be safe — require SSL, allow self-signed.
  return { rejectUnauthorized: false };
}

/**
 * Pooled-connection detection + direct-host rewrite for migrations.
 *
 * Connection poolers (PgBouncer in transaction mode — Neon's `-pooler`
 * endpoint, Supabase's pooler host) reject the advisory locks and prepared
 * statements knex migrations rely on. Migrations must run against the DIRECT
 * endpoint; only runtime traffic should use the pooled URL.
 *
 *   isPooledUrl(url)        → true if the host looks like a pooler
 *   directMigrationUrl(url) → a URL safe to migrate against, or null if we
 *                             can't safely derive one (caller must then ask
 *                             the user for a direct connection string)
 *
 * Neon is the only provider whose direct host is a deterministic transform
 * of the pooled host (drop "-pooler"). Supabase's direct host is a different
 * shape (db.<ref>.supabase.co) we can't reconstruct from the pooled URL, so
 * we return null rather than fabricate a wrong host.
 */
export function isPooledUrl(url) {
  try {
    const host = new URL(url).hostname;
    return /-pooler\./i.test(host) || /\.pooler\.supabase\.com$/i.test(host);
  } catch {
    return false;
  }
}

export function directMigrationUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  // Neon: ep-xxx-pooler.region.aws.neon.tech → ep-xxx.region.aws.neon.tech
  if (/\.neon\.tech$/i.test(host) && /-pooler\./i.test(host)) {
    parsed.hostname = host.replace('-pooler.', '.');
    return parsed.toString();
  }
  // Already-direct Neon host (or any non-pooled host) needs no rewrite.
  if (!isPooledUrl(url)) return url;
  // Pooled, but not a shape we can safely rewrite (e.g. Supabase pooler).
  return null;
}

/** Identify the most-likely provider for diagnostics / hints. */
export function classifyProvider(url) {
  try {
    const host = new URL(url).hostname;
    if (/\.neon\.tech$/i.test(host)) return 'neon';
    if (/\.pooler\.supabase\.com$/i.test(host)) return 'supabase-pooler';
    if (/\.supabase\.co$/i.test(host) || /\.supabase\.com$/i.test(host)) return 'supabase';
    if (/\.rds\.amazonaws\.com$/i.test(host)) return 'aws-rds';
    if (/\.render\.com$/i.test(host)) return 'render';
    if (/\.railway\.app$/i.test(host)) return 'railway';
    if (/\.cockroachlabs\.cloud$/i.test(host)) return 'cockroachdb';
    if (NO_SSL_HOSTS.some((re) => re.test(host))) return 'local';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
