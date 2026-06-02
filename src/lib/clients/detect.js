/**
 * Multi-signal client detection.
 *
 * Config-dir existence alone misses an editor that's installed but hasn't run
 * yet (no ~/.cursor until first launch). So we OR three filesystem signals —
 * none of which rely on $PATH, since the daemon runs under a stripped PATH:
 *
 *   1. config dir present   → the tool has run at least once
 *   2. app bundle present   → installed GUI app (macOS), even if never launched
 *   3. CLI binary present   → installed CLI, probed in the usual install dirs
 *
 * Filesystem-only and fast (a few existsSync calls), safe to run on every
 * listConnectors().
 */
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

/** Any of these absolute paths exist? */
export function anyPathExists(paths = []) {
  return paths.some((p) => p && existsSync(p));
}

/** macOS: is any of these app bundles installed (system or user Applications)? */
export function appInstalled(appNames = []) {
  if (platform() !== 'darwin') return false;
  const roots = ['/Applications', join(HOME, 'Applications')];
  return appNames.some((n) => roots.some((r) => existsSync(join(r, `${n}.app`))));
}

/** Is a CLI binary present in a common install dir? (PATH-independent.) */
export function binInstalled(binNames = []) {
  const dirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    join(HOME, '.local', 'bin'),
    join(HOME, '.bun', 'bin'),
    join(HOME, '.cargo', 'bin'),
  ];
  const exts = platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return binNames.some((b) => dirs.some((d) => exts.some((e) => existsSync(join(d, b + e)))));
}

/** OR across config dirs, app bundles, and CLI binaries. */
export function detectInstalled({ dirs = [], apps = [], bins = [] } = {}) {
  return anyPathExists(dirs) || appInstalled(apps) || binInstalled(bins);
}
