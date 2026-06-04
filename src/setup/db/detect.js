/**
 * Database detection — probe the machine so the UI can present the right DB
 * choices (connect to a running local PG, start a stopped one, spin up Docker,
 * or paste an external URL). Detection drives the UI; the service modules do
 * the work for the resolved choice.
 */
import { userInfo } from 'node:os';

import pg from 'pg';

import { detectDocker } from '../../db/provision/docker.js';
import { tcpOpen, binaryOnPath } from './shared.js';

// Homebrew/apt commonly land Postgres on 5432, but parallel installs (and this
// machine) drift to 5433+. Probe both so we don't miss a running server.
const CANDIDATE_PORTS = [5432, 5433];

/** A connection failure that means "a Postgres is here, but it wants credentials
 * we don't have" — as opposed to "nothing is listening". pg's auth errors are
 * the 28xxx SQLSTATE class (28P01 password auth failed, 28000 invalid auth);
 * the SASL "client password must be a string" crash is the same situation seen
 * before the server can even return a SQLSTATE (a passwordless probe against a
 * SCRAM server). Either way the server EXISTS — we just can't read its version. */
function isAuthRequiredError(err) {
  if (typeof err?.code === 'string' && err.code.startsWith('28')) return true;
  return /SASL|SCRAM|password must be a string|password authentication failed/i.test(err?.message || '');
}

/**
 * Connect to the maintenance db as the OS user; read version + pgvector
 * availability. Pass an empty-string password so a SCRAM/scram-sha-256 server
 * returns a clean auth error instead of crashing the handshake with pg's
 * "client password must be a string" (which used to leak to the setup UI for
 * anyone with their own auth-required Postgres on 5432 — even when they picked
 * the bundled/embedded database).
 *
 * Returns one of:
 *   { ok:true, version, pgvectorAvailable }      — logged in, read everything
 *   { ok:false, present:true, requiresAuth:true } — a Postgres is here but
 *                                                   rejected our passwordless probe
 *   { ok:false, present:false, code, message }    — nothing reachable / other error
 */
async function probeLocalServer(host, port, user) {
  const client = new pg.Client({ host, port, database: 'postgres', user, password: '', connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const v = await client.query('SELECT version() AS v');
    const ext = await client.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    return { ok: true, present: true, version: v.rows[0].v, pgvectorAvailable: ext.rowCount > 0 };
  } catch (err) {
    if (isAuthRequiredError(err)) return { ok: false, present: true, requiresAuth: true };
    return { ok: false, present: false, code: err.code, message: err.message };
  } finally {
    try { await client.end(); } catch { /* */ }
  }
}

/**
 * @returns {Promise<{
 *   embedded: { available:boolean },
 *   local: { installed:boolean, running:boolean, host:string, port:number,
 *            version:string|null, adminUser:string, pgvectorAvailable:boolean,
 *            requiresAuth:boolean },
 *   docker: { available:boolean, version:string|null, reason:string|null },
 * }>}
 */
export async function detectDatabase() {
  const adminUser = userInfo().username;
  const local = {
    installed: false,
    running: false,
    host: 'localhost',
    port: 5432,
    version: null,
    adminUser,
    pgvectorAvailable: false,
    requiresAuth: false,
  };

  for (const port of CANDIDATE_PORTS) {
    if (!(await tcpOpen('127.0.0.1', port))) continue;
    const probe = await probeLocalServer('127.0.0.1', port, adminUser);
    // A running Postgres counts as detected whether or not our passwordless
    // probe could log in. When it rejected us (requiresAuth), we still mark it
    // running/installed and pin the port; version + pgvector stay unknown until
    // the user supplies credentials. We never surface the raw pg/SASL error.
    if (probe.ok || probe.present) {
      local.running = true;
      local.installed = true;
      local.port = port;
      if (probe.ok) {
        local.version = probe.version;
        local.pgvectorAvailable = probe.pgvectorAvailable;
      } else {
        local.requiresAuth = true;
      }
      break;
    }
  }
  if (!local.installed) {
    local.installed = (await binaryOnPath('postgres')) || (await binaryOnPath('pg_ctl'));
  }

  const docker = await detectDocker();
  // Embedded (PGlite) is always available — it's an in-process WASM engine with
  // no host prerequisites. Reported so the UI can render it data-driven.
  const embedded = { available: true };
  return { embedded, local, docker };
}
