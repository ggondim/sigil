/**
 * Shared helpers for the database setup services (local / docker / external).
 *
 * These are deliberately small and dependency-light so each service module
 * (local-postgres, docker, external) stays focused on its own provisioning
 * logic and uses one consistent error shape, password policy, and persistence.
 */
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { diagnoseError } from '../../db/setup.js';
import { patchConfig } from '../config-store.js';
import { StepError } from '../errors.js';

export { StepError };

/** Map a raw driver/pg error (or a {code,message} probe result) to a StepError. */
export function fromError(err) {
  const d = diagnoseError(err);
  return new StepError({ message: d.humanMessage, hint: d.fixHint, kind: d.kind });
}

/** SQL- and URL-safe random password ([A-Za-z0-9_-]). */
export function genPassword() {
  return randomBytes(18).toString('base64url');
}

/** Double-quote a SQL identifier safely. */
export const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Persist the resolved database connection into config.json. */
export function persistDatabase(patch) {
  return patchConfig('database', patch);
}

/** Is something accepting TCP connections at host:port? */
export function tcpOpen(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const s = net.connect(port, host);
    const done = (v) => { try { s.destroy(); } catch { /* */ } resolve(v); };
    s.setTimeout(timeout);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

/** Resolve once host:port starts accepting connections, else throw StepError. */
export function waitForPort(host, port, deadlineMs = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = async () => {
      if (await tcpOpen(host, port, 800)) return resolve();
      if (Date.now() - t0 > deadlineMs) {
        return reject(new StepError({
          message: `Postgres did not start listening on ${host}:${port}.`,
          hint: 'Check the Postgres logs, or use an external connection string.',
          kind: 'unreachable',
        }));
      }
      setTimeout(tick, 600);
    };
    tick();
  });
}

/** True if `bin --version` exits 0 (binary resolvable on PATH). */
export function binaryOnPath(bin) {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch { /* */ } resolve(false); }, 3000);
  });
}

// Fixed identity of the Sigil database + least-privilege role. Shared by the
// local and docker services so they agree.
export const SIGIL_DB = 'sigil';
export const SIGIL_USER = 'sigil_app';
