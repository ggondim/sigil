/**
 * `sigil service` — install/manage the always-up OS service so Sigil starts on
 * login and is auto-restarted on crash/sleep/reboot (launchd / systemd /
 * scheduled-task, picked by platform).
 */
import {
  installService, uninstallService, serviceStatus,
  startService, stopService, restartService, platformSupported,
} from '../supervisor/index.js';
import { formatUptime } from '../lib/format.js';

const HELP = `sigil service — keep Sigil always running

Usage:
  sigil service install      Install + start the OS service (always-up)
  sigil service uninstall    Remove the OS service
  sigil service status       Show service + heartbeat status
  sigil service start
  sigil service stop
  sigil service restart

Backend: launchd (macOS) · systemd --user (Linux) · Scheduled Task (Windows).
Once installed, Sigil starts at login and is auto-restarted if it crashes.`;

export async function runService(args) {
  const [sub] = args;
  if (!sub || sub === '--help' || sub === '-h') { console.log(HELP); return; }

  if (!platformSupported() && sub !== 'status') {
    console.error(`No always-up backend for platform "${process.platform}". Sigil still auto-starts on first use.`);
    process.exit(1);
  }

  switch (sub) {
    case 'install': return cmdInstall();
    case 'uninstall': return cmdUninstall();
    case 'status': return cmdStatus();
    case 'start': return cmdSimple(startService, 'started');
    case 'stop': return cmdSimple(stopService, 'stopped');
    case 'restart': return cmdSimple(restartService, 'restarted');
    default:
      console.error(`Unknown subcommand: service ${sub}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

async function cmdInstall() {
  try {
    const res = await installService();
    console.log(`Sigil service installed (${res.manager}).`);
    console.log(`  unit    ${res.unitPath}`);
    console.log('  Sigil will now start on login and restart automatically if it crashes.');
  } catch (err) {
    console.error(`service install failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdUninstall() {
  const res = await uninstallService();
  console.log(`Sigil service removed (${res.manager}). Sigil still auto-starts on first use.`);
}

async function cmdSimple(fn, verb) {
  const res = await fn();
  if (res.ok) console.log(`Sigil service ${verb} (${res.manager}).`);
  else { console.error(`service ${verb} failed (${res.manager}).`); process.exit(1); }
}

async function cmdStatus() {
  const { platform, supervisor, heartbeat } = await serviceStatus();
  console.log(`platform   ${platform}`);
  if (supervisor.unsupported) {
    console.log('service    unsupported on this platform (auto-spawn only)');
  } else {
    console.log(`service    ${supervisor.installed ? 'installed' : 'not installed'} (${supervisor.manager})`);
    console.log(`           ${supervisor.running ? 'loaded/running' : 'not loaded'}`);
    if (supervisor.unitPath) console.log(`  unit     ${supervisor.unitPath}`);
  }
  if (heartbeat) {
    const age = heartbeat.ageMs == null ? '—' : `${Math.round(heartbeat.ageMs / 1000)}s ago`;
    console.log(`daemon     pid ${heartbeat.pid} · v${heartbeat.version} · up ${formatUptime(Date.now() - heartbeat.startedAt)}`);
    console.log(`heartbeat  ${age}${heartbeat.supervised ? ' · supervised' : ''}`);
  } else {
    console.log('daemon     no heartbeat (not running)');
  }
}
