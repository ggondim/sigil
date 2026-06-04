// Regression tests for detectRunningDaemon's "is a daemon already running?"
// decision. The bug these guard against: a live PID alone was trusted, so a
// stale pidfile naming a *recycled* PID (now held by an unrelated process, e.g.
// after a hard kill or reboot) made the booting daemon declare itself a
// duplicate and exit without binding its socket — the CLI then timed out.
//
// We isolate the PID/heartbeat logic by disabling the HTTP /healthz probe
// (SIGIL_HTTP_ENABLED=false) so the test can never accidentally consult a real
// daemon listening on 127.0.0.1:7777, and we sandbox $HOME so SIGIL_HOME points
// at a throwaway dir. Modules are re-imported per case because paths.js caches
// SIGIL_HOME from $HOME at import time.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let home;
const origHome = process.env.HOME;
const origHttp = process.env.SIGIL_HTTP_ENABLED;

function seed({ pid, heartbeat }) {
  const sigilHome = join(home, '.sigil');
  mkdirSync(sigilHome, { recursive: true });
  if (pid !== undefined) writeFileSync(join(sigilHome, 'sigild.pid'), String(pid), 'utf8');
  if (heartbeat !== undefined) {
    writeFileSync(join(sigilHome, 'heartbeat.json'), JSON.stringify(heartbeat), 'utf8');
  }
  return sigilHome;
}

async function loadDetect() {
  vi.resetModules(); // re-evaluate paths.js so SIGIL_HOME picks up the new $HOME
  return import('./lifecycle.js');
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sigil-detect-test-'));
  process.env.HOME = home;
  process.env.SIGIL_HTTP_ENABLED = 'false'; // skip the /healthz probe
});

afterEach(() => {
  if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;
  if (origHttp === undefined) delete process.env.SIGIL_HTTP_ENABLED; else process.env.SIGIL_HTTP_ENABLED = origHttp;
  rmSync(home, { recursive: true, force: true });
});

describe('detectRunningDaemon', () => {
  it('treats a live PID with NO heartbeat as stale (the recycled-PID case) and cleans up', async () => {
    // process.pid is unquestionably alive, but it is not our daemon and there
    // is no heartbeat to confirm it. This is exactly the recycled-PID scenario.
    const sigilHome = seed({ pid: process.pid });
    const { detectRunningDaemon } = await loadDetect();

    expect(await detectRunningDaemon()).toBeNull();
    expect(existsSync(join(sigilHome, 'sigild.pid'))).toBe(false); // stale pidfile removed
  });

  it('treats a live PID with a STALE heartbeat as stale and cleans up', async () => {
    const sigilHome = seed({
      pid: process.pid,
      heartbeat: { pid: process.pid, ts: Date.now() - 60_000 }, // older than the 45s window
    });
    const { detectRunningDaemon } = await loadDetect();

    expect(await detectRunningDaemon()).toBeNull();
    expect(existsSync(join(sigilHome, 'sigild.pid'))).toBe(false);
  });

  it('reports the PID as running when a FRESH heartbeat confirms it', async () => {
    const sigilHome = seed({
      pid: process.pid,
      heartbeat: { pid: process.pid, ts: Date.now() },
    });
    const { detectRunningDaemon } = await loadDetect();

    expect(await detectRunningDaemon()).toBe(process.pid);
    expect(existsSync(join(sigilHome, 'sigild.pid'))).toBe(true); // incumbent's files left intact
  });

  it('does not trust a fresh heartbeat whose pid disagrees with the pidfile', async () => {
    // Live pidfile PID, fresh heartbeat — but for a *different* pid. Without the
    // pid-match guard a recycled PID could ride in on a leftover heartbeat.
    seed({
      pid: process.pid,
      heartbeat: { pid: process.pid + 1, ts: Date.now() },
    });
    const { detectRunningDaemon } = await loadDetect();

    expect(await detectRunningDaemon()).toBeNull();
  });

  it('returns null on a clean slate (no pidfile, nothing serving)', async () => {
    mkdirSync(join(home, '.sigil'), { recursive: true });
    const { detectRunningDaemon } = await loadDetect();

    expect(await detectRunningDaemon()).toBeNull();
  });
});
