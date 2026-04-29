/**
 * Hebbian co-retrieval edges — facts retrieved together get stronger ties.
 *
 * Called fire-and-forget from the search path (see hybrid.js). Writes use
 * lexicographic canonicalization (fact_a_id < fact_b_id) to avoid duplicate
 * (a,b)/(b,a) rows.
 *
 * The graph that emerges from this is "facts the user thinks about together,"
 * built passively from real query behavior. We use it in graph_boost during
 * search ranking and for "related facts" traversal.
 */

import cortexDb from '../../db/cortex.js';

/**
 * Strengthen edges between every pair in the given fact list.
 * Skips silently if fewer than 2 facts. O(K²) writes — call this with top-K
 * (typically K=5–10), not the full retrieval set.
 */
async function strengthenEdges(factIds) {
  if (!factIds || factIds.length < 2) return;

  const ids = [...new Set(factIds.filter((id) => Number.isInteger(id)))].sort((a, b) => a - b);
  if (ids.length < 2) return;

  const pairs = [];
  for (let xyz = 0; xyz < ids.length; xyz++) {
    for (let inner = xyz + 1; inner < ids.length; inner++) {
      pairs.push([ids[xyz], ids[inner]]);
    }
  }

  // Single multi-row upsert; ON CONFLICT bumps strength + last_seen_at.
  // Using raw SQL because Knex's onConflict doesn't compose well with
  // `strength + EXCLUDED.strength` increments.
  const valuesSql = pairs.map(() => '(?, ?, 1, NOW(), NOW())').join(', ');
  const params = pairs.flat();

  await cortexDb.raw(`
    INSERT INTO hebbian_edge (fact_a_id, fact_b_id, strength, first_seen_at, last_seen_at)
    VALUES ${valuesSql}
    ON CONFLICT (fact_a_id, fact_b_id)
    DO UPDATE SET
      strength = hebbian_edge.strength + 1,
      last_seen_at = NOW()
  `, params);
}

/**
 * Find facts most-frequently-co-retrieved with the given fact.
 * Used for "related facts" UX and for graph_boost in search.
 */
async function getCoRetrievedFacts(factId, { limit = 5, minStrength = 2 } = {}) {
  const { rows } = await cortexDb.raw(`
    SELECT
      CASE WHEN fact_a_id = ? THEN fact_b_id ELSE fact_a_id END AS partner_id,
      strength,
      last_seen_at AS "lastSeenAt"
    FROM hebbian_edge
    WHERE (fact_a_id = ? OR fact_b_id = ?)
      AND strength >= ?
    ORDER BY strength DESC, last_seen_at DESC
    LIMIT ?
  `, [factId, factId, factId, minStrength, limit]);
  return rows;
}

/**
 * Optional housekeeping: drop edges that haven't been reinforced in a long
 * time. Keeps the graph from growing unboundedly. Run from `cortex maintain`.
 */
async function consolidateCoRetrievalEdges({ floor = 1, decayDays = 90 } = {}) {
  const { rows } = await cortexDb.raw(`
    DELETE FROM hebbian_edge
    WHERE strength <= ?
      AND last_seen_at < NOW() - (INTERVAL '1 day' * ?)
    RETURNING fact_a_id
  `, [floor, decayDays]);
  return rows.length;
}

export { strengthenEdges, getCoRetrievedFacts, consolidateCoRetrievalEdges };
