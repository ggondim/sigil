/**
 * DB auto-provision RPCs for the onboarding wizard's database step.
 *
 *   dbDockerAvailable() → { available, version, reason }
 *   dbProvisionDocker() → stand up the local pgvector container, write the
 *                         connection into .env, run migrations, return result.
 *
 * Falls back transparently to the existing testDbConnection/ensurePgvector/
 * runMigrations URL flow when Docker is absent — the GUI greys the Docker card.
 */
import knexFactory from 'knex';

import { MIGRATIONS_DIR } from '../../lib/paths.js';
import { writeEnvKeys } from '../../lib/env-file.js';
import { AppError, fromDiagnosis } from '../../lib/errors.js';
import { buildUrlConnection } from '../../db/drivers/url.js';
import { detectDocker, provisionLocalPostgres } from '../../db/provision/docker.js';

async function migrateUrl(url) {
  const knex = knexFactory({ client: 'pg', connection: buildUrlConnection(url), pool: { min: 1, max: 2 } });
  try {
    const [batchNo, ran] = await knex.migrate.latest({ directory: MIGRATIONS_DIR });
    return { batchNo, ran };
  } finally {
    await knex.destroy();
  }
}

export function registerDbProvision(registry) {
  registry.register('dbDockerAvailable', async () => detectDocker());

  registry.register('dbProvisionDocker', async () => {
    let result;
    try {
      result = await provisionLocalPostgres();
    } catch (err) {
      if (err?.dockerUnavailable) {
        throw new AppError({ errorCode: 'DOCKER_UNAVAILABLE', message: err.message });
      }
      throw new AppError({ errorCode: 'DOCKER_PROVISION_FAILED', message: err?.message });
    }

    // Persist the local URL and clear any stale discrete-host config.
    writeEnvKeys({
      SIGIL_DATABASE_URL: result.url,
      SIGIL_DB_TYPE: 'postgres',
      SIGIL_DB_HOST: null,
      SIGIL_DB_PORT: null,
      SIGIL_DB_NAME: null,
      SIGIL_DB_USER: null,
      SIGIL_DB_PASSWORD: null,
    });

    let migration;
    try {
      migration = await migrateUrl(result.url);
    } catch (err) {
      const { diagnoseError } = await import('../../db/setup.js');
      throw fromDiagnosis(diagnoseError(err), { data: { stage: 'migrate', container: result.container } });
    }

    return {
      ok: true,
      url: result.url,
      port: result.port,
      container: result.container,
      image: result.image,
      reused: result.reused,
      pgvector: result.pgvector,
      migrationsRan: migration.ran.length,
      migrationBatch: migration.batchNo,
    };
  });
}
