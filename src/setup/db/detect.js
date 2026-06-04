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

/** Connect to the maintenance db as the OS user; read version + pgvector availability. */
async function probeLocalServer(host, port, user) {
  const client = new pg.Client({ host, port, database: 'postgres', user, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const v = await client.query('SELECT version() AS v');
    const ext = await client.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    return { ok: true, version: v.rows[0].v, pgvectorAvailable: ext.rowCount > 0 };
  } catch (err) {
    return { ok: false, code: err.code, message: err.message };
  } finally {
    try { await client.end(); } catch { /* */ }
  }
}

/**
 * @returns {Promise<{
 *   embedded: { available:boolean },
 *   local: { installed:boolean, running:boolean, host:string, port:number,
 *            version:string|null, adminUser:string, pgvectorAvailable:boolean },
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
  };

  for (const port of CANDIDATE_PORTS) {
    if (!(await tcpOpen('127.0.0.1', port))) continue;
    const probe = await probeLocalServer('127.0.0.1', port, adminUser);
    if (probe.ok) {
      local.running = true;
      local.installed = true;
      local.port = port;
      local.version = probe.version;
      local.pgvectorAvailable = probe.pgvectorAvailable;
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
