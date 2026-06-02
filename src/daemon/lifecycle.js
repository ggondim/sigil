import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

import { SIGIL_DAEMON_PID, SIGIL_DAEMON_SOCK, SIGIL_HEARTBEAT, SIGIL_HOME } from '../lib/paths.js';

/**
 * Check whether a PID is alive. `process.kill(pid, 0)` is the POSIX trick:
 * signal 0 doesn't deliver anything, but the kernel still validates that
 * the target exists and the caller has permission to signal it.
 */
export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (treat as alive)
    return err.code === 'EPERM';
  }
}

export async function readPidFile() {
  if (!existsSync(SIGIL_DAEMON_PID)) return null;
  try {
    const raw = (await readFile(SIGIL_DAEMON_PID, 'utf8')).trim();
    const pid = Number(raw);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function writePidFile() {
  await mkdir(SIGIL_HOME, { recursive: true });
  await writeFile(SIGIL_DAEMON_PID, String(process.pid), 'utf8');
}

export async function removePidFile() {
  try { await unlink(SIGIL_DAEMON_PID); } catch { /* missing is fine */ }
}

export async function removeSocketFile() {
  try { await unlink(SIGIL_DAEMON_SOCK); } catch { /* missing is fine */ }
}

/** Best-effort read of the heartbeat pid (the most accurate "who's serving"). */
async function readHeartbeatPid() {
  try {
    const hb = JSON.parse(await readFile(SIGIL_HEARTBEAT, 'utf8'));
    return Number.isFinite(hb?.pid) ? hb.pid : null;
  } catch {
    return null;
  }
}

/**
 * Probe GET /healthz on the configured HTTP port. A 200 means a daemon is
 * already serving the GUI — authoritative even when the pidfile is stale or
 * was written by a different process (e.g. a `node src/daemon` dev run). The
 * HTTP port is the one resource that can't be silently stolen (TCP bind is
 * exclusive), so it's the most reliable "is a daemon already up?" signal.
 */
async function isHttpDaemonServing() {
  try {
    const { default: config } = await import('../config.js');
    if (!config.http.enabled) return false;
    const { host, port } = config.http;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 500);
    try {
      const res = await fetch(`http://${host}:${port}/healthz`, { signal: ctrl.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false; // nothing listening / refused / timed out
  }
}

/**
 * Returns the live daemon PID if one is running, otherwise null and cleans
 * up any stale pid/socket files. Call this before starting a new daemon.
 *
 * Checks two independent signals so we never start a second daemon that
 * steals the Unix socket but can't bind the HTTP port (the split-brain that
 * leaves the GUI talking to a daemon with a stale auth token):
 *   1. the pidfile names a live process, OR
 *   2. something answers /healthz on the configured HTTP port.
 */
export async function detectRunningDaemon() {
  const pid = await readPidFile();
  if (pid && isPidAlive(pid)) return pid;

  // Pidfile didn't name a live process — but a daemon started outside this
  // pidfile may still be serving. Probe the port before declaring the slot
  // free; if it answers, leave the socket/pidfile untouched (they're the
  // incumbent's) and report the real pid from the heartbeat when we can.
  if (await isHttpDaemonServing()) {
    return (await readHeartbeatPid()) ?? 'unknown';
  }

  // Genuinely stale — clean up so a fresh start succeeds.
  if (pid) await removePidFile();
  if (existsSync(SIGIL_DAEMON_SOCK)) await removeSocketFile();
  return null;
}

/**
 * Install signal handlers and an idempotent shutdown hook. The shutdown
 * callback is called at most once even if multiple signals arrive.
 */
export function installShutdownHooks(shutdown) {
  let firing = false;
  const fire = async (signal) => {
    if (firing) return;
    firing = true;
    try {
      await shutdown(signal);
    } catch (err) {
      process.stderr.write(`[sigild] shutdown error: ${err.message}\n`);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => fire('SIGTERM'));
  process.on('SIGINT',  () => fire('SIGINT'));
  process.on('SIGHUP',  () => fire('SIGHUP'));
}

export async function ensureSigilHome() {
  await mkdir(SIGIL_HOME, { recursive: true });
}

export { dirname };
