import knex from 'knex';

import config from '../config.js';
import { selectDriver } from './drivers/index.js';

const driver = selectDriver(config);

const cortexDb = knex({
  client: 'pg',
  connection: driver.connection,
  pool: {
    // min:0 — hooks are short-lived processes (open pool, do one query, exit).
    // The old min:2 forced two eager connections on every hook invocation and
    // kept them alive, wasting Postgres backends for a 10ms task.
    min: 0,
    max: 10,
    // Don't hang forever when Postgres is down or saturated — fail fast so the
    // caller (hook/daemon) surfaces a clear error instead of blocking. tarn's
    // defaults are 30s; 10s is plenty for a local/cloud Postgres.
    acquireTimeoutMillis: 10_000,
    createTimeoutMillis: 10_000,
    // Reap idle connections so a long-lived daemon doesn't pin backends.
    idleTimeoutMillis: 30_000,
  },
  postProcessResponse,
  wrapIdentifier,
});

cortexDb.__sigilDriver = driver;

function postProcessResponse(result) {
  if (Array.isArray(result)) return result.map(toCamel);
  if (result && typeof result === 'object') return toCamel(result);
  return result;
}

function wrapIdentifier(value, origImpl) {
  return origImpl(toSnake(value));
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    // Only camelCase the top-level keys from DB columns.
    // Do NOT recurse into values — they may contain JSON data
    // with intentional snake_case keys (metadata, entityTypes, etc.).
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

function toSnake(str) {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export default cortexDb;
