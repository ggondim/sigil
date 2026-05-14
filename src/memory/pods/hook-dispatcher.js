/**
 * Hook → pod dispatcher.
 *
 * Hooks (stop, post-tool-use, session-end, user-prompt-submit) used to
 * resolve one pod — the active claude_session — and attach facts to it.
 * In 0.10.0, with project/person/playbook kinds in the registry, every
 * hook fact should land in *all* relevant pods: the active session +
 * the active project (+ later, the active agent in 0.11.0). This
 * dispatcher is the single seam that walks the registry, opens/refreshes
 * pods for every kind that has a lifecycle hook for this event, and
 * returns the flat list of pod uids the caller should attach to.
 *
 * Kinds outside this dispatcher's purview:
 *   • person  — attached via the entity-linker path when a person is
 *                mentioned. Orthogonal to hook events.
 *   • playbook — user-authored, never auto-created by hooks.
 *   • vital   — virtual, no pod row.
 */

import { ensureActiveSession } from './active-session.js';
import { ensureProjectPod } from './kinds/project.js';

// Ensure every kind whose lifecycle.open should fire on a generic hook
// event has its pod open and up-to-date. Returns:
//   { sessionPod, projectPod, podUids }
// podUids is the flat array the caller passes to ingestDocument().
//
// Idempotent: same input → same pods, no duplicates created.
export async function ensureActivePodsForHook({
  sessionId,
  cwd = null,
  transcriptPath = null,
  model = null,
  namespace = null,
}) {
  let sessionPod = null;
  if (sessionId) {
    try {
      sessionPod = await ensureActiveSession({
        sessionId,
        transcriptPath,
        cwd,
        model,
        namespace,
      });
    } catch {
      sessionPod = null;
    }
  }

  let projectPod = null;
  if (cwd) {
    try {
      projectPod = await ensureProjectPod({ cwd, namespace });
    } catch {
      projectPod = null;
    }
  }

  const podUids = [sessionPod, projectPod].filter(Boolean).map((p) => p.uid);

  return { sessionPod, projectPod, podUids };
}
