const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

const CONFIDENCE_CASE = `CASE confidence
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 1
            ELSE 0
          END`;

// Normalize a device filter value to the integer fact.created_by_device_id key.
// Accepts a number, a numeric string ("3"), or null/undefined (no filter).
// Non-numeric strings (a device *name*) must be resolved to an id by the caller
// before reaching here — this layer only knows the integer FK.
function normalizeDeviceId(deviceId) {
  if (deviceId == null) return null;
  const n = Number(deviceId);
  return Number.isInteger(n) ? n : null;
}

// Build the additive WHERE fragments + ordered params shared by both search
// CTEs. Author predicates (agent / device) are PROVENANCE filters: opt-in,
// never part of the default WHERE. When absent, results are identical to before.
//
// The returned `authorClause` is concatenated AFTER temporal/category in the
// SQL, and its params are appended to `filterParams` in the same order, so the
// existing `[minRank, ...extras]` threading in hybrid-sql.js keeps working.
function buildFactFilters({ minConfidence = 'medium', pointInTime, categories, agent, deviceId } = {}) {
  const minRank = CONFIDENCE_RANK[minConfidence] ?? 1;
  const params = [minRank];
  let temporalClause = '';
  let categoryClause = '';
  let authorClause = '';

  if (pointInTime) {
    temporalClause = 'AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)';
    params.push(pointInTime, pointInTime);
  }

  if (categories?.length) {
    categoryClause = 'AND category = ANY(?)';
    params.push(categories);
  }

  if (agent) {
    authorClause += ' AND created_by_agent = ?';
    params.push(agent);
  }

  const devId = normalizeDeviceId(deviceId);
  if (devId != null) {
    authorClause += ' AND created_by_device_id = ?';
    params.push(devId);
  }

  return { minRank, temporalClause, categoryClause, authorClause, filterParams: params };
}

// Owner-scoped read enforcement (P2). Builds the WHERE-clause fragment that
// hides 'private'-kind facts (claude_session, person) created by a DIFFERENT
// device. The rule, in plain terms — a fact is HIDDEN only when ALL hold:
//   1. it belongs to a pod whose kind visibility is 'private', AND
//   2. its created_by_device_id is NOT NULL, AND
//   3. that device id differs from the current device.
// Everything else stays visible:
//   - shared/public-kind facts (project, playbook, vital) — never gated here.
//   - facts not in any private pod — never gated.
//   - legacy rows with created_by_device_id IS NULL (pre-provenance) — always
//     visible to everyone; owner-scoping must not hide pre-existing data.
//
// Returns '' (no filter) when enforcement is disabled, when there are no
// private kinds registered, or when the current device id is unknown — in those
// cases the prior global-visibility behaviour is preserved.
//
// The clause references the outer `fact` row via its `id` column, so it can be
// dropped into either the semantic or keyword CTE unchanged. It emits two
// placeholders in order: [currentDeviceId, privateKinds(text[])].
function buildVisibilityClause({ currentDeviceId, privateKinds, scopeEnabled = true } = {}) {
  if (!scopeEnabled || !currentDeviceId || !Array.isArray(privateKinds) || privateKinds.length === 0) {
    return { visibilityClause: '', visibilityParams: [] };
  }

  // NOTE: created_by_device_id is an INTEGER FK to device.id in production
  // (see migration 20260601000002_add-fact-provenance), but currentDeviceId
  // here is the caller's identity which can be the local install's UUID
  // (config.json device.id, e.g. "f6ce8926-...") rather than an integer device
  // PK. Binding that UUID against the integer column made Postgres try to
  // coerce it to int and blow up ("invalid input syntax for type integer").
  // Compare both sides as text so the predicate is type-safe regardless of
  // whether the id is an integer device PK (RPC remote device → matches its
  // own rows) or a UUID (local install → matches none, so every OTHER device's
  // private fact is hidden while its own NULL-stamped facts stay visible).
  const visibilityClause = `
        AND NOT (
          created_by_device_id IS NOT NULL
          AND created_by_device_id::text <> ?
          AND id = ANY(
            SELECT pm.member_id
            FROM pod_membership pm
            JOIN pod p ON p.id = pm.pod_id
            WHERE pm.member_type = 'fact'
              AND p.pod_type = ANY(?::text[])
          )
        )`;

  // Bind the device id as text so it pairs with the `created_by_device_id::text`
  // comparison above — a JS number would otherwise be sent as an int param and
  // re-introduce an int/text mismatch.
  return { visibilityClause, visibilityParams: [String(currentDeviceId), privateKinds] };
}

export { CONFIDENCE_CASE, buildFactFilters, buildVisibilityClause, normalizeDeviceId };
