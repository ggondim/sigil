/**
 * Active-session cursor — the bridge between Claude Code hooks and the
 * pod store. Hooks call ensureActiveSession on every fire; the first
 * call creates the session pod and stamps `~/.sigil/.active-session.json`,
 * later calls find the existing pod and update the cursor.
 *
 * Other commands (`sigil session current`, hot-context) read the cursor
 * to discover "what session is the user in right now" without paying a
 * DB lookup on every prompt.
 *
 * The cursor is system-internal — never user-edited — so it uses a plain
 * write rather than safe-write's .bak machinery.
 */

import { writeFile, readFile, unlink } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import * as podStore from './store.js';
import * as sessionType from './kinds/claude_session.js';
import config from '../../config.js';

const home = process.env.HOME || process.env.USERPROFILE;
const CURSOR_PATH = join(home, '.sigil', '.active-session.json');

// How long after `started_at` we consider a cursor "stale" — for the
// hot-context boost. Past this, the session is treated as ended even
// if no SessionEnd fired (Claude Code sometimes skips it on crash).
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

async function readCursor() {
  try {
    const raw = await readFile(CURSOR_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCursor(state) {
  if (!existsSync(dirname(CURSOR_PATH))) {
    mkdirSync(dirname(CURSOR_PATH), { recursive: true });
  }
  await writeFile(CURSOR_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// Called by hooks on every fire. Returns the session pod (creating if
// new, refreshing the cursor either way). Idempotent on session_id.
async function ensureActiveSession({
  sessionId,
  transcriptPath = null,
  cwd = null,
  model = null,
  namespace = null,
}) {
  if (!sessionId) {
    throw new Error('ensureActiveSession requires sessionId from hook stdin');
  }

  const ns = namespace || config.defaults.namespace;
  const cursor = await readCursor();

  // Already tracking this session — find the existing pod, bump turn_count.
  if (cursor && cursor.session_id === sessionId && cursor.namespace === ns) {
    const pod = await podStore.findByUid(cursor.pod_uid);
    if (pod) {
      await podStore.patchAttrs(pod.id, {
        turn_count: (parseTurnCount(pod.attrs) || 0) + 1,
      });
      await touchCursor(cursor);
      return pod;
    }
    // Cursor referenced a pod that no longer exists — fall through to
    // upsert path, which will recreate.
  }

  // First fire for this session, or stale cursor — upsert.
  const startedAt = new Date();
  const { pod } = await podStore.upsertPod({
    podType: sessionType.POD_TYPE,
    externalId: sessionId,
    name: sessionType.defaultName({ sessionId, startedAt }),
    namespace: ns,
    attrs: sessionType.buildAttrs({
      sessionId,
      transcriptPath,
      cwd,
      turnCount: 1,
      model,
    }),
    startedAt,
  });

  await writeCursor({
    session_id: sessionId,
    pod_uid: pod.uid,
    namespace: ns,
    started_at: pod.startedAt ?? startedAt.toISOString(),
    last_seen_at: new Date().toISOString(),
  });

  return pod;
}

async function touchCursor(cursor) {
  await writeCursor({ ...cursor, last_seen_at: new Date().toISOString() });
}

// Public reader for hot-context and CLI. Returns null if no cursor or if
// the cursor is older than STALE_AFTER_MS.
async function getActiveSessionPodUid({ allowStale = false } = {}) {
  const cursor = await readCursor();
  if (!cursor || !cursor.pod_uid) return null;

  if (!allowStale && cursor.started_at) {
    const age = Date.now() - new Date(cursor.started_at).getTime();
    if (age > STALE_AFTER_MS) return null;
  }

  return cursor.pod_uid;
}

async function getActiveCursor() {
  return readCursor();
}

// Called by SessionEnd hook (or by `sigil session end` manually). Sets
// ended_at on the pod, optionally writes a conclusion, removes the cursor.
async function endActiveSession({ conclusion = null, summary = null } = {}) {
  const cursor = await readCursor();
  if (!cursor) return null;

  const pod = await podStore.findByUid(cursor.pod_uid);
  if (pod) {
    if (conclusion || summary) {
      const patch = {};
      if (conclusion) patch.conclusion = conclusion;
      if (summary) patch.summary = summary;
      await podStore.patchAttrs(pod.id, patch);
    }
    await podStore.setEndedAt(pod.id);
  }

  try { await unlink(CURSOR_PATH); } catch { /* already gone */ }
  return pod;
}

function parseTurnCount(attrs) {
  if (!attrs) return 0;
  if (typeof attrs === 'object') return attrs.turn_count ?? 0;
  try { return JSON.parse(attrs).turn_count ?? 0; } catch { return 0; }
}

export {
  ensureActiveSession,
  getActiveSessionPodUid,
  getActiveCursor,
  endActiveSession,
  CURSOR_PATH,
};
