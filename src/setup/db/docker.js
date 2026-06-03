/**
 * Docker service — spin up a dedicated, pgvector-enabled Postgres container
 * for Sigil (the zero-prerequisite path). Wraps the low-level container ops in
 * db/provision/docker.js with migrate + verify + persist, so the setup step
 * doesn't touch Docker directly.
 */
import { detectDocker, startDockerEngine, provisionLocalPostgres } from '../../db/provision/docker.js';
import { runMigrationsOn } from '../../db/migrate.js';
import { StepError, fromError, persistDatabase, SIGIL_DB, SIGIL_USER } from './shared.js';
import { verifyConnection } from './test.js';

/**
 * @param {object} input  (unused today; reserved for image/port overrides)
 * @param {(p:{pct:number,label:string})=>void} emit
 */
export async function provisionDocker(input, emit = () => {}) {
  try {
    // Re-probe at provision time (detection is not cached) so a daemon that
    // stopped after the card was shown is handled cleanly, not with a raw
    // socket error mid-provision.
    const dk = await detectDocker();
    if (!dk.installed) {
      throw new StepError({
        message: 'Docker is not installed on this machine.',
        hint: 'Install Docker Desktop, or use a local install / external connection string.',
        kind: 'other',
      });
    }
    if (!dk.running) {
      emit({ pct: 8, label: 'Docker is installed but not running — starting it…' });
      try {
        await startDockerEngine();
      } catch (e) {
        throw new StepError({
          message: e.message || 'Could not start Docker.',
          hint: 'Start Docker Desktop manually and retry, or use a local install / external connection.',
          kind: 'other',
        });
      }
    }

    emit({ pct: 25, label: 'Provisioning a dedicated Sigil Postgres container…' });
    // Surface image-pull progress (first run pulls ~400MB).
    const prov = await provisionLocalPostgres({ onProgress: (label) => emit({ pct: 35, label }) });

    emit({ pct: 70, label: 'Running migrations…' });
    const m = await runMigrationsOn({ url: prov.url });

    emit({ pct: 90, label: 'Verifying connection…' });
    await verifyConnection({ url: prov.url });

    persistDatabase({ mode: 'docker', url: prov.url, host: 'localhost', port: prov.port, name: SIGIL_DB, user: SIGIL_USER, password: null });
    emit({ pct: 100, label: 'Database ready.' });
    return { mode: 'docker', url: prov.url, port: prov.port, reused: prov.reused, migrationsRan: m.ran.length };
  } catch (err) {
    if (err instanceof StepError) throw err;
    if (err.dockerUnavailable) {
      throw new StepError({ message: 'Docker is not available.', hint: 'Start Docker Desktop and retry.', kind: 'other' });
    }
    throw fromError(err);
  }
}
