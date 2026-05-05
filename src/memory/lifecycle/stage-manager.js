/**
 * Lifecycle stage manager — runs the periodic transitions between
 * fresh → stable → editing → stable for facts.
 *
 * These run as batch jobs (`smara maintain`), not on hot paths. The hot-path
 * transition is `stable → editing` on search-hit, which `recordAccess` does
 * inline.
 *
 * Why this matters (per OGHAM-LEARNINGS.md §A):
 *   - `fresh` facts are recently captured; we don't fully trust them yet
 *   - The promotion gate (1 hour + importance=vital OR has-been-accessed)
 *     filters out low-signal noise without an LLM call
 *   - `editing` facts are receptive to AUDM updates and contradictions
 *   - `stable` facts are the canonical pool that retrieval ranks against
 */

import cortexDb from '../../db/cortex.js';

const FRESH_PROMOTION_AGE_HOURS = 1;
const EDITING_WINDOW_MINUTES = 30;

/**
 * Fresh → stable after 1 hour, IF importance is vital OR the fact has been
 * accessed at least once. Low-importance fresh facts that nobody touched
 * stay at "fresh" forever (effectively forgotten without ever entering the
 * canonical pool).
 */
async function promoteFreshFacts() {
  const { rows } = await cortexDb.raw(`
    UPDATE fact_lifecycle fl
    SET stage = 'stable',
        stage_entered_at = NOW()
    FROM fact f
    WHERE fl.fact_id = f.id
      AND fl.stage = 'fresh'
      AND fl.stage_entered_at < NOW() - INTERVAL '${FRESH_PROMOTION_AGE_HOURS} hours'
      AND (f.importance = 'vital' OR fl.access_count > 0)
    RETURNING fl.fact_id
  `);
  return rows.length;
}

/**
 * Editing → stable after 30 minutes of no new access. The editing window is
 * a short-lived state where AUDM updates land more freely.
 */
async function closeEditingWindows() {
  const { rows } = await cortexDb.raw(`
    UPDATE fact_lifecycle
    SET stage = 'stable',
        stage_entered_at = NOW()
    WHERE stage = 'editing'
      AND stage_entered_at < NOW() - INTERVAL '${EDITING_WINDOW_MINUTES} minutes'
    RETURNING fact_id
  `);
  return rows.length;
}

/**
 * Snapshot of how facts are distributed across stages — useful for
 * `smara status` and the maintenance summary.
 */
async function getLifecycleStats() {
  const rows = await cortexDb('fact_lifecycle')
    .select('stage')
    .count({ count: '*' })
    .groupBy('stage');
  const acc = { fresh: 0, stable: 0, editing: 0 };
  for (const r of rows) acc[r.stage] = Number(r.count);
  return acc;
}

export { promoteFreshFacts, closeEditingWindows, getLifecycleStats };
