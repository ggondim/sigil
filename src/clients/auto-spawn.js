import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import {
  SIGIL_DAEMON_LOG,
  SIGIL_DAEMON_SOCK,
  SIGIL_HOME,
} from '../lib/paths.js';
import { detectRunningDaemon } from '../daemon/lifecycle.js';
import { resolveDaemonScript } from '../supervisor/entry-path.js';
import { openSocketClient } from './socket-client.js';

const READY_TIMEOUT_MS = 5_000;
// PR review #15: exponential backoff. Typical cold start is well under
// 1 second; the first few polls catch it fast, then we space out so we
// don't burn CPU on slow boots.
const POLL_INTERVAL_MIN_MS = 25;
const POLL_INTERVAL_MAX_MS = 400;

/**
 * Return an open socket client to the daemon, starting the daemon first
 * if it isn't running.
 *
 * Behavior:
 *   1. If the daemon is already running, just connect.
 *   2. Otherwise, fork-exec the daemon detached, then poll for the socket
 *      to appear and accept a 'ping'.
 *   3. Cap the total wait at READY_TIMEOUT_MS.
 */
export async function connectOrStartDaemon({ quiet = false, timeoutMs } = {}) {
  const opts = timeoutMs ? { timeoutMs } : undefined;
  if (await canConnect()) {
    return openSocketClient(opts);
  }

  if (!quiet) process.stderr.write('[sigil] daemon not running, starting it...\n');
  await spawnDaemon();
  await waitForReady();
  return openSocketClient(opts);
}

async function canConnect() {
  if (!existsSync(SIGIL_DAEMON_SOCK)) return false;
  try {
    const c = await openSocketClient({ timeoutMs: 1_000 });
    await c.call('ping', {});
    await c.close();
    return true;
  } catch {
    return false;
  }
}

async function spawnDaemon() {
  // Fresh-install safety: ensure SIGIL_HOME exists BEFORE we try to
  // open the log file as the parent's stdio target. The child would
  // also create it, but the openSync() calls below run in the parent
  // and would ENOENT on a brand-new install. (PR review #3.)
  mkdirSync(SIGIL_HOME, { recursive: true });

  // Defensive cleanup: detectRunningDaemon clears stale pid/socket files
  // if no live daemon exists. Without this, a previous crash can leave
  // ~/.sigil/sock behind and the new daemon will refuse to bind.
  await detectRunningDaemon();

  const daemonScript = resolveDaemonScript();

  // Detach completely so the daemon outlives this CLI process. stdio is
  // sent to the log file (append) instead of /dev/null so a crash on
  // startup leaves a trail.
  const out = openSync(SIGIL_DAEMON_LOG, 'a');
  const err = openSync(SIGIL_DAEMON_LOG, 'a');

  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      SIGIL_DAEMON_AUTOSPAWN: '1',
    },
  });
  child.unref();

  // Close our copies of the fds — the child has them now.
  try { closeSync(out); } catch { /* ignore */ }
  try { closeSync(err); } catch { /* ignore */ }
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let interval = POLL_INTERVAL_MIN_MS;
  while (Date.now() < deadline) {
    if (await canConnect()) return;
    await delay(interval);
    interval = Math.min(interval * 2, POLL_INTERVAL_MAX_MS);
  }
  throw new Error(
    `daemon did not become ready within ${READY_TIMEOUT_MS}ms — check ${SIGIL_DAEMON_LOG}`,
  );
}
