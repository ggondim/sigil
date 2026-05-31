/**
 * Single source of truth for "how do you launch the daemon" — the node binary
 * and the daemon entry script. Shared by auto-spawn.js (detached spawn) and the
 * supervisor backends (launchd/systemd/scheduled-task) so a service unit can
 * never point at a stale path after a dev→bundled transition.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PKG_ROOT } from '../lib/paths.js';

export function resolveDaemonScript() {
  const candidates = [
    join(PKG_ROOT, 'dist', 'daemon.js'),
    join(PKG_ROOT, 'src', 'daemon', 'index.js'),
    // Last resort: relative to this file (works when bundled).
    join(dirname(fileURLToPath(import.meta.url)), '..', 'daemon', 'index.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('cannot locate daemon entry point (looked in dist/ and src/daemon/)');
}

/** Absolute path to the node binary launching this process. */
export function nodeExecPath() {
  return process.execPath;
}
