/**
 * Docker-based local Postgres provisioning for "foolproof" onboarding.
 *
 * When Docker is available we can stand up a pgvector-enabled Postgres with
 * zero user effort: a named container (`sigil-postgres`) on a persistent
 * volume (`sigil-pgdata`, survives reboots), the `pgvector/pgvector` image
 * (ships the extension — sidesteps the "extension not available" trap), and a
 * least-privilege `sigil_app` role.
 *
 * Role/DB/extension setup runs via `docker exec … psql -U postgres` (local
 * peer auth) rather than a TCP admin connection — that removes any need to
 * persist the superuser password and makes container REUSE safe: we can always
 * reset the app password without knowing the original superuser secret.
 *
 * Everything here is best-effort and throws plain Errors with context; the RPC
 * handler (daemon/handlers/db-provision.js) maps failures to AppError codes.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';

import { probeUrlConnection } from '../setup.js';
import { readEnvRaw } from '../../lib/env-file.js';

export const CONTAINER = 'sigil-postgres';
export const VOLUME = 'sigil-pgdata';
export const IMAGE = 'pgvector/pgvector:pg16';
const DB_NAME = 'sigil';
const APP_USER = 'sigil_app';

function run(cmd, args, { timeout = 15000, input } = {}) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: -1, out: '', err: e.message, spawnError: true });
      return;
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, timeout);
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: e.message, spawnError: true }); });
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code, out: out.trim(), err: err.trim() }); });
    if (input != null) { proc.stdin.write(input); proc.stdin.end(); }
  });
}

let dockerCache = null;
/** Is Docker installed and its daemon responding? Cached for the process. */
export async function detectDocker({ refresh = false } = {}) {
  if (dockerCache && !refresh) return dockerCache;
  const r = await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 8000 });
  dockerCache = (r.code === 0 && !r.spawnError)
    ? { available: true, version: r.out || 'unknown', reason: null }
    : { available: false, version: null, reason: r.spawnError ? 'docker not found on PATH' : (r.err || 'docker daemon not responding') };
  return dockerCache;
}

async function containerState() {
  const r = await run('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { timeout: 8000 });
  if (r.code !== 0) return { exists: false, running: false };
  return { exists: true, running: r.out === 'true' };
}

async function containerPort() {
  const r = await run('docker', ['port', CONTAINER, '5432/tcp'], { timeout: 8000 });
  if (r.code !== 0) return null;
  const m = r.out.match(/:(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function pickPort(start = 5432) {
  for (let p = start; p < start + 25; p++) {
    if (await portFree(p)) return p;
  }
  return start;
}

function genPassword() {
  // base64url → only [A-Za-z0-9_-], safe in SQL single-quotes AND URLs.
  return randomBytes(18).toString('base64url');
}

/** Run SQL inside the container as the postgres superuser (peer auth). */
async function psql(db, sql) {
  const r = await run(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db],
    { input: sql, timeout: 20000 },
  );
  if (r.code !== 0) throw new Error(`psql(${db}) failed: ${r.err || r.out || `exit ${r.code}`}`);
  return r.out;
}

async function waitForReady({ deadlineMs = 30000 } = {}) {
  const t0 = Date.now();
  let lastErr = 'timed out';
  while (Date.now() - t0 < deadlineMs) {
    const r = await run('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { timeout: 5000 });
    if (r.code === 0) return;
    lastErr = r.err || r.out || lastErr;
    await new Promise((res) => setTimeout(res, 700));
  }
  throw new Error(`Postgres did not become ready in ${deadlineMs}ms: ${lastErr}`);
}

/**
 * Provision (or reuse) the local Postgres container and return a ready-to-use
 * least-privilege connection URL. Idempotent: re-running reuses the existing
 * container + volume and only resets the app password.
 *
 * @returns {Promise<{ url, port, container, image, reused, pgvector }>}
 */
export async function provisionLocalPostgres({ env = readEnvRaw() } = {}) {
  const docker = await detectDocker();
  if (!docker.available) {
    const e = new Error(docker.reason || 'Docker is not available');
    e.dockerUnavailable = true;
    throw e;
  }

  const state = await containerState();
  let port;
  const appPw = genPassword();

  if (state.exists) {
    if (!state.running) {
      const started = await run('docker', ['start', CONTAINER], { timeout: 15000 });
      if (started.code !== 0) throw new Error(`failed to start existing ${CONTAINER}: ${started.err}`);
    }
    port = (await containerPort()) || 5432;
  } else {
    port = await pickPort(5432);
    const superPw = genPassword();
    const created = await run('docker', [
      'run', '-d',
      '--name', CONTAINER,
      '--restart', 'unless-stopped',
      '-e', `POSTGRES_PASSWORD=${superPw}`,
      '-e', `POSTGRES_DB=${DB_NAME}`,
      '-v', `${VOLUME}:/var/lib/postgresql/data`,
      '-p', `${port}:5432`,
      IMAGE,
    ], { timeout: 60000 });
    if (created.code !== 0) {
      // Most common real-world failure: image needs pulling, or name clash.
      throw new Error(`docker run failed: ${created.err || created.out}`);
    }
  }

  await waitForReady();

  // Ensure database, least-privilege role, grants, and pgvector — all via peer
  // auth inside the container (no superuser password needed).
  const dbExists = await psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`);
  if (!dbExists.includes('1')) await psql('postgres', `CREATE DATABASE ${DB_NAME}`);

  await psql('postgres', `DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='${APP_USER}') THEN
      ALTER ROLE ${APP_USER} WITH LOGIN PASSWORD '${appPw}';
    ELSE
      CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${appPw}';
    END IF;
  END $$;`);
  await psql('postgres', `GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${APP_USER}`);
  await psql(DB_NAME, `GRANT ALL ON SCHEMA public TO ${APP_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_USER};
    CREATE EXTENSION IF NOT EXISTS vector;`);

  const url = `postgres://${APP_USER}:${encodeURIComponent(appPw)}@localhost:${port}/${DB_NAME}`;

  // Verify over TCP exactly as the external-URL path does.
  const probe = await probeUrlConnection(url);
  if (!probe.ok) {
    throw new Error(`provisioned container did not accept a TCP connection (${probe.stage}): ${probe.error}`);
  }

  return { url, port, container: CONTAINER, image: IMAGE, reused: state.exists, pgvector: probe.pgvector };
}

/**
 * Daemon-start convenience: if the configured DB is the local container and it
 * exists-but-stopped, start it. Best-effort, never throws.
 * @returns {Promise<{ started: boolean, reason?: string }>}
 */
export async function ensureLocalPostgresRunning(env = readEnvRaw()) {
  try {
    const url = env.SIGIL_DATABASE_URL || '';
    if (!/@localhost:|@127\.0\.0\.1:/.test(url)) return { started: false, reason: 'not a local url' };
    const docker = await detectDocker();
    if (!docker.available) return { started: false, reason: 'docker unavailable' };
    const state = await containerState();
    if (!state.exists) return { started: false, reason: 'no sigil-postgres container' };
    if (state.running) return { started: false, reason: 'already running' };
    const r = await run('docker', ['start', CONTAINER], { timeout: 15000 });
    return r.code === 0 ? { started: true } : { started: false, reason: r.err };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}

export async function stopLocalPostgres() {
  return run('docker', ['stop', CONTAINER], { timeout: 20000 });
}

export async function removeLocalPostgres({ deleteVolume = false } = {}) {
  await run('docker', ['rm', '-f', CONTAINER], { timeout: 20000 });
  if (deleteVolume) await run('docker', ['volume', 'rm', VOLUME], { timeout: 15000 });
}
