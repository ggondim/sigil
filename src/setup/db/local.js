/**
 * Local-Postgres service.
 *
 * Connects to a Postgres already installed on this machine (Homebrew, apt,
 * Postgres.app, …), creates the sigil database + least-privilege role + the
 * pgvector extension, runs migrations, and persists the connection. Can also
 * start a stopped install when the user opts in.
 */
import { userInfo } from 'node:os';
import { spawn } from 'node:child_process';

import { ensurePostgresDatabase } from '../../db/setup.js';
import { runMigrationsOn } from '../../db/migrate.js';
import {
  StepError, fromError, genPassword, waitForPort, persistDatabase, SIGIL_DB, SIGIL_USER,
} from './shared.js';
import { verifyConnection } from './test.js';

/**
 * @param {{host?:string, port?:number, adminUser?:string, adminPassword?:string,
 *          action?:'connect'|'start', brewFormula?:string, dataDir?:string}} input
 * @param {(p:{pct:number,label:string})=>void} emit
 */
export async function provisionLocal(input, emit = () => {}) {
  const host = input.host || 'localhost';
  const port = Number(input.port) || 5432;
  const adminUser = input.adminUser || userInfo().username;
  const adminPassword = input.adminPassword || '';

  try {
    if (input.action === 'start') {
      emit({ pct: 5, label: 'Starting local Postgres…' });
      await startLocalPostgres(input);
      await waitForPort(host, port);
    }

    emit({ pct: 20, label: `Connecting to Postgres on ${host}:${port}…` });
    const sigilPassword = genPassword();

    emit({ pct: 45, label: 'Creating database, role, and pgvector…' });
    await ensurePostgresDatabase({
      admin: { host, port, user: adminUser, password: adminPassword },
      sigil: { database: SIGIL_DB, user: SIGIL_USER, password: sigilPassword },
    });

    emit({ pct: 70, label: 'Running migrations…' });
    const m = await runMigrationsOn({ host, port, database: SIGIL_DB, user: SIGIL_USER, password: sigilPassword });

    emit({ pct: 90, label: 'Verifying connection…' });
    await verifyConnection({ host, port, database: SIGIL_DB, user: SIGIL_USER, password: sigilPassword });

    persistDatabase({ mode: 'local', url: null, host, port, name: SIGIL_DB, user: SIGIL_USER, password: sigilPassword });
    emit({ pct: 100, label: 'Database ready.' });
    return { mode: 'local', host, port, database: SIGIL_DB, user: SIGIL_USER, migrationsRan: m.ran.length };
  } catch (err) {
    throw err instanceof StepError ? err : fromError(err);
  }
}

/**
 * Best-effort start of a stopped local install. Platform-aware; throws a
 * StepError with the manual command when it can't.
 */
export async function startLocalPostgres(input = {}) {
  const tries = [];
  if (process.platform === 'darwin') {
    // Homebrew dropped the unversioned `postgresql` formula in 2022 — it's now
    // `postgresql@NN`. If the caller didn't pin one, try the current versions
    // newest-first, then the bare name as a last resort for old installs. Each
    // `brew services start` no-ops fast if that formula isn't installed.
    const formulae = input.brewFormula
      ? [input.brewFormula]
      : ['postgresql@17', 'postgresql@16', 'postgresql@15', 'postgresql@14', 'postgresql'];
    for (const f of formulae) tries.push(['brew', ['services', 'start', f]]);
  }
  if (input.dataDir) tries.push(['pg_ctl', ['-D', input.dataDir, 'start']]);
  if (process.platform === 'linux') tries.push(['systemctl', ['start', 'postgresql']]);

  for (const [cmd, args] of tries) {
    const ok = await new Promise((resolve) => {
      const p = spawn(cmd, args, { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
      setTimeout(() => { try { p.kill(); } catch { /* */ } resolve(false); }, 15000);
    });
    if (ok) return;
  }
  throw new StepError({
    message: 'Could not start the local Postgres service automatically.',
    hint: process.platform === 'darwin'
      ? 'Start it yourself (e.g. `brew services start postgresql@17`) and retry, or use an external connection.'
      : 'Start it yourself (e.g. `sudo systemctl start postgresql`) and retry, or use an external connection.',
    kind: 'unreachable',
  });
}
