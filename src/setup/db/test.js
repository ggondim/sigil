/**
 * Common connection testing for every database service.
 *
 * One place that answers "is this connection actually usable by Sigil?" so the
 * local, docker, and external services don't each re-implement verification.
 * Wraps the low-level probes in db/setup.js and normalizes failures into a
 * StepError.
 */
import { probeSigilConnection, probeUrlConnection } from '../../db/setup.js';
import { StepError, fromError } from './shared.js';

/**
 * Verify a freshly-configured connection.
 *   spec = { url }                                  → external / docker
 *   spec = { host, port, database, user, password } → local
 * Returns { database?, provider?, pgvector? }. Throws StepError on failure.
 */
export async function verifyConnection(spec) {
  if (spec.url) {
    const p = await probeUrlConnection(spec.url);
    if (!p.ok) throw fromError({ code: p.code, message: p.error || `connection failed at ${p.stage}` });
    return { database: p.database, provider: p.provider, pgvector: p.pgvector };
  }
  const p = await probeSigilConnection(spec);
  if (!p.ok) throw fromError({ code: p.code, message: p.message });
  return {};
}

export { StepError };
