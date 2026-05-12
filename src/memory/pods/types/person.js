/**
 * Person pod type — one per person you have a relationship with.
 *
 * external_id  = the *primary* platform handle, whichever was first set
 *                (so partial-unique upsert on the dominant platform works)
 * entity_id    = FK to the canonical `entity` row (where entity_type='person')
 * connection_id= null
 *
 * attrs shape:
 *   {
 *     "platforms": {
 *       "slack":  { "user_id": "U123", "team_id": "T456", "display_name": "dhaval" },
 *       "github": { "username": "dhaval-x" },
 *       "email":  "dhaval@airtribe.live"
 *     },
 *     "role": "Engineering Manager",
 *     "relationship": "manager",   // free text: manager | report | peer | external | family | friend
 *     "notes": "Owns the planner roadmap."
 *   }
 *
 * In PR1 there is no connector that produces platform metadata; person
 * pods are created explicitly via `sigil pod create --type=person`.
 * The auto-creation path from `linker.js` is wired but dormant.
 */

export const POD_TYPE = 'person';

export function buildAttrs({
  platforms = {},
  role = null,
  relationship = null,
  notes = null,
}) {
  return { platforms, role, relationship, notes };
}

// Pick the primary platform handle, in priority order, as the external_id
// for the partial-unique constraint. Returns null if no platform handle
// is present (caller should then insert with external_id=null and forgo
// upsert idempotency).
export function primaryExternalId(platforms = {}) {
  if (platforms.slack?.user_id) return `slack:${platforms.slack.user_id}`;
  if (platforms.github?.username) return `github:${platforms.github.username}`;
  if (platforms.email) return `email:${String(platforms.email).toLowerCase()}`;
  return null;
}

// Merge new platform info into an existing person pod's attrs.platforms,
// preserving prior keys. Useful when a person first surfaces via Slack
// and later their GitHub handle is also linked.
export function mergePlatforms(existing = {}, incoming = {}) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) continue;
    merged[key] = { ...(merged[key] || {}), ...(typeof value === 'object' ? value : { value }) };
  }
  return merged;
}

export function formatForDisplay(pod) {
  const a = parseAttrs(pod.attrs);
  return {
    uid: pod.uid,
    name: pod.name,
    entityId: pod.entityId,
    platforms: a.platforms ?? {},
    role: a.role,
    relationship: a.relationship,
    notes: a.notes,
    memberFactCount: pod.memberFactCount,
    memberDocCount: pod.memberDocCount,
  };
}

function parseAttrs(attrs) {
  if (!attrs) return {};
  if (typeof attrs === 'object') return attrs;
  try { return JSON.parse(attrs); } catch { return {}; }
}
