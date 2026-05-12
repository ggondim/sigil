/**
 * Hot context — surfaces the most relevant facts for automatic injection
 * into every new Claude session via ~/.sigil/CLAUDE.md.
 *
 * Four-pass blend, merged in priority order with text-level dedup:
 *   1. 6 slots — active session pod (what we were just doing)
 *   2. 4 slots — person pods of people interacted with in last 24h
 *   3. 8 slots — global vital facts (current behaviour, the safety net)
 *   4. 2 slots — project pod of cwd (deferred; PR2 reserves these)
 *
 * Auto-derivation: when no pod uids are passed, the function reads the
 * active-session cursor (~/.sigil/.active-session.json) and queries
 * person-pods touched in the last 24h. Callers that don't know about
 * pods (e.g., updateContextSnapshot) get pod-aware behaviour for free.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

import cortexDb from '../../db/cortex.js';
import config from '../../config.js';

const CONTEXT_LIMIT = 20;

const SLOT_SESSION = 6;
const SLOT_PERSON = 4;
const SLOT_VITAL = 8;
const SLOT_PROJECT = 2; // reserved for PR2

const PERSON_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function getHotFacts({
  namespace,
  limit = CONTEXT_LIMIT,
  sessionPodUid: explicitSessionUid,
  personPodUids: explicitPersonUids,
} = {}) {
  const ns = namespace || config.defaults.namespace;

  const sessionPodUid = explicitSessionUid ?? await resolveSessionPodUid();
  const personPodUids = explicitPersonUids ?? await resolveRecentPersonPodUids(ns);

  // Run all passes in parallel; we'll merge after.
  const [sessionFacts, personFacts, vitalFacts] = await Promise.all([
    sessionPodUid ? factsInPodByRecency(sessionPodUid, ns, SLOT_SESSION) : [],
    personPodUids.length ? factsInPodsByRecency(personPodUids, ns, SLOT_PERSON) : [],
    vitalFactsByImportance(ns, SLOT_VITAL),
  ]);
  // SLOT_PROJECT reserved for PR2 — for now its slots are absorbed by the
  // tail of vitalFacts via slice(0, limit) below.

  const seen = new Set();
  const blended = [];
  for (const list of [sessionFacts, personFacts, vitalFacts]) {
    for (const content of list) {
      if (!content || seen.has(content)) continue;
      seen.add(content);
      blended.push(content);
      if (blended.length >= limit) return blended;
    }
  }

  // Backfill from recent (current pre-pod behaviour) if blend underflows
  // — preserves usefulness when no pods exist yet for legacy users.
  if (blended.length < limit) {
    const filler = await cortexDb('fact as f')
      .leftJoin('fact_lifecycle as fl', 'fl.fact_id', 'f.id')
      .where({ 'f.status': 'active', 'f.namespace': ns })
      .orderByRaw('COALESCE(fl.last_accessed_at, f.created_at) DESC')
      .limit(limit)
      .pluck('f.content');

    for (const content of filler) {
      if (!content || seen.has(content)) continue;
      seen.add(content);
      blended.push(content);
      if (blended.length >= limit) break;
    }
  }

  return blended.slice(0, limit);
}

// ── Pod-aware passes ─────────────────────────────────────────────────

async function factsInPodByRecency(podUid, namespace, slots) {
  return cortexDb('fact as f')
    .join('pod_membership as pm', function () {
      this.on('pm.member_id', '=', 'f.id')
          .andOnVal('pm.member_type', '=', 'fact');
    })
    .join('pod as p', 'p.id', 'pm.pod_id')
    .leftJoin('fact_lifecycle as fl', 'fl.fact_id', 'f.id')
    .where({ 'p.uid': podUid, 'f.status': 'active', 'f.namespace': namespace })
    .orderByRaw('COALESCE(fl.last_accessed_at, f.created_at) DESC')
    .limit(slots)
    .pluck('f.content');
}

async function factsInPodsByRecency(podUids, namespace, slots) {
  return cortexDb('fact as f')
    .join('pod_membership as pm', function () {
      this.on('pm.member_id', '=', 'f.id')
          .andOnVal('pm.member_type', '=', 'fact');
    })
    .join('pod as p', 'p.id', 'pm.pod_id')
    .leftJoin('fact_lifecycle as fl', 'fl.fact_id', 'f.id')
    .whereIn('p.uid', podUids)
    .where({ 'f.status': 'active', 'f.namespace': namespace })
    .orderByRaw('COALESCE(fl.last_accessed_at, f.created_at) DESC')
    .limit(slots)
    .pluck('f.content');
}

async function vitalFactsByImportance(namespace, slots) {
  return cortexDb('fact as f')
    .leftJoin('fact_lifecycle as fl', 'fl.fact_id', 'f.id')
    .where({ 'f.status': 'active', 'f.namespace': namespace, 'f.importance': 'vital' })
    .orderByRaw('COALESCE(fl.access_count, 0) DESC, f.created_at DESC')
    .limit(slots)
    .pluck('f.content');
}

// ── Auto-derivation ──────────────────────────────────────────────────

async function resolveSessionPodUid() {
  try {
    const { getActiveSessionPodUid } = await import('../pods/active-session.js');
    return await getActiveSessionPodUid();
  } catch {
    return null;
  }
}

// Person pods whose facts were accessed in the last 24h. Cheap: joins
// pod_membership (member_type='fact') → fact_lifecycle.last_accessed_at,
// filters by person pods, distincts the pod uids.
async function resolveRecentPersonPodUids(namespace) {
  try {
    const cutoff = new Date(Date.now() - PERSON_RECENT_WINDOW_MS);
    const rows = await cortexDb('pod as p')
      .join('pod_membership as pm', 'pm.pod_id', 'p.id')
      .join('fact_lifecycle as fl', 'fl.fact_id', 'pm.member_id')
      .where('pm.memberType', 'fact')
      .where('p.podType', 'person')
      .where('p.namespace', namespace)
      .where('p.status', 'active')
      .where('fl.lastAccessedAt', '>=', cutoff)
      .distinct('p.uid');
    return rows.map((r) => r.uid);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────

export async function updateContextSnapshot({ namespace, limit } = {}) {
  const fs = await import('node:fs/promises');
  // Sigil owns ~/.sigil/CLAUDE.md entirely — never touches ~/.claude/CLAUDE.md
  const cortexMdPath = join(homedir(), '.sigil', 'CLAUDE.md');

  const facts = await getHotFacts({ namespace, limit });
  const marker = '<!-- sigil-context -->';

  if (!facts.length) return 0;

  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const block = [
    marker,
    `## Active Context  *(${facts.length} facts · refreshed ${date})*`,
    '',
    facts.map((f) => `- ${f}`).join('\n'),
    marker,
  ].join('\n');

  let existing = '';
  try { existing = await fs.readFile(cortexMdPath, 'utf8'); } catch { /* file may not exist */ }

  const updated = existing.includes(marker)
    ? existing.replace(new RegExp(`${marker}[\\s\\S]*?${marker}`), block)
    : existing + (existing.trim() ? '\n\n' : '') + block + '\n';

  await fs.writeFile(cortexMdPath, updated, 'utf8');

  return facts.length;
}
