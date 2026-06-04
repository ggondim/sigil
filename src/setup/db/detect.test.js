// Regression tests for database detection — specifically the case where the
// machine already runs a local Postgres that requires auth. The passwordless
// probe used to crash pg's SCRAM handshake ("client password must be a string")
// and leak that raw string into the setup UI, even for users who chose the
// bundled/embedded database. Detection must instead report "a server is here,
// it just needs credentials" and never surface the pg/SASL error.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, per-test-controllable behavior for the mocked pg client. `connect`
// drives the login outcome; the other fields let a test simulate whether the
// server is Sigil's own (db/role present, signature stamped) or a stranger's.
const state = vi.hoisted(() => ({
  connect: null,
  sigilDbExists: true,
  sigilRoleExists: true,
  signature: null,
}));

vi.mock('pg', () => {
  class Client {
    constructor(cfg) { this.cfg = cfg; }
    async connect() { return state.connect(this.cfg); }
    async query(sql) {
      if (/version\(\)/.test(sql)) return { rows: [{ v: 'PostgreSQL 16.2' }], rowCount: 1 };
      if (/pg_available_extensions/.test(sql)) return { rows: [{ '?column?': 1 }], rowCount: 1 }; // pgvector
      if (/pg_database WHERE datname/.test(sql)) return { rows: [], rowCount: state.sigilDbExists ? 1 : 0 };
      if (/pg_roles WHERE rolname/.test(sql)) return { rows: [], rowCount: state.sigilRoleExists ? 1 : 0 };
      if (/shobj_description/.test(sql)) return { rows: [{ sig: state.signature }], rowCount: 1 };
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    async end() { /* noop */ }
  }
  return { default: { Client } };
});

vi.mock('./shared.js', () => ({
  // Port 5432 looks open; 5433 closed — one probe per run.
  tcpOpen: vi.fn(async (_host, port) => port === 5432),
  binaryOnPath: vi.fn(async () => false),
  SIGIL_DB: 'sigil',
  SIGIL_USER: 'sigil_app',
}));

vi.mock('../../db/provision/docker.js', () => ({
  detectDocker: vi.fn(async () => ({ available: false, version: null, reason: 'not installed' })),
}));

import { detectDatabase } from './detect.js';

beforeEach(() => {
  vi.clearAllMocks();
  state.sigilDbExists = true;
  state.sigilRoleExists = true;
  state.signature = null;
});

describe('detectDatabase — local server probing', () => {
  it('reports an auth-required server as present (running) without leaking the SASL error', async () => {
    state.connect = () => {
      const err = new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string');
      return Promise.reject(err);
    };

    const res = await detectDatabase();
    expect(res.local.running).toBe(true);
    expect(res.local.installed).toBe(true);
    expect(res.local.requiresAuth).toBe(true);
    expect(res.local.port).toBe(5432);
    // No raw probe message anywhere in the local descriptor.
    expect(JSON.stringify(res.local)).not.toMatch(/SASL|password must be a string/i);
  });

  it('classifies a 28P01 password-auth failure the same way (present, requiresAuth)', async () => {
    state.connect = () => {
      const err = new Error('password authentication failed for user "chinmay"');
      err.code = '28P01';
      return Promise.reject(err);
    };

    const res = await detectDatabase();
    expect(res.local.running).toBe(true);
    expect(res.local.requiresAuth).toBe(true);
  });

  it('reads version + pgvector when the probe can actually log in', async () => {
    state.connect = () => Promise.resolve();

    const res = await detectDatabase();
    expect(res.local.running).toBe(true);
    expect(res.local.requiresAuth).toBe(false);
    expect(res.local.version).toMatch(/PostgreSQL/);
    expect(res.local.pgvectorAvailable).toBe(true);
  });

  it('flags a Sigil-signed database as isSigil (authoritative over the heuristic)', async () => {
    state.connect = () => Promise.resolve();
    state.signature = 'sigil-instance:v1:device-abc';
    state.sigilDbExists = false; // signature alone is enough
    state.sigilRoleExists = false;

    const res = await detectDatabase();
    expect(res.local.isSigil).toBe(true);
    expect(res.local.foreign).toBe(false);
  });

  it('falls back to the db+role heuristic when a server has no signature (legacy install)', async () => {
    state.connect = () => Promise.resolve();
    state.signature = null;
    state.sigilDbExists = true;
    state.sigilRoleExists = true;

    const res = await detectDatabase();
    expect(res.local.isSigil).toBe(true);
    expect(res.local.foreign).toBe(false);
  });

  it('marks a stranger\'s Postgres (no signature, no sigil db/role) as foreign, not ours', async () => {
    state.connect = () => Promise.resolve();
    state.signature = null;
    state.sigilDbExists = false;
    state.sigilRoleExists = false;

    const res = await detectDatabase();
    expect(res.local.running).toBe(true);
    expect(res.local.isSigil).toBe(false);
    expect(res.local.foreign).toBe(true);
  });

  it('marks an auth-required server as foreign (can\'t prove it\'s Sigil\'s)', async () => {
    state.connect = () => {
      const err = new Error('password authentication failed for user "chinmay"');
      err.code = '28P01';
      return Promise.reject(err);
    };

    const res = await detectDatabase();
    expect(res.local.requiresAuth).toBe(true);
    expect(res.local.isSigil).toBe(false);
    expect(res.local.foreign).toBe(true);
  });

  it('treats a non-auth connection failure as "not running" (server absent)', async () => {
    state.connect = () => {
      const err = new Error('connection refused');
      err.code = 'ECONNREFUSED';
      return Promise.reject(err);
    };

    const res = await detectDatabase();
    expect(res.local.running).toBe(false);
    expect(res.local.requiresAuth).toBe(false);
  });

  it('passes an empty-string password to the probe client (never undefined)', async () => {
    let seenCfg = null;
    state.connect = (cfg) => { seenCfg = cfg; return Promise.resolve(); };

    await detectDatabase();
    expect(seenCfg).not.toBeNull();
    expect(seenCfg.password).toBe('');
    expect(typeof seenCfg.password).toBe('string');
  });
});
