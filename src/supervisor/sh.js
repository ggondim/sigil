/**
 * Tiny synchronous command runner for supervisor backends (launchctl,
 * systemctl, schtasks). Returns a uniform { code, out, err } and never throws.
 */
import { spawnSync } from 'node:child_process';

export function sh(cmd, args, { input, timeout = 20000 } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, timeout });
  return {
    code: r.status ?? -1,
    out: (r.stdout || '').trim(),
    err: (r.stderr || r.error?.message || '').trim(),
  };
}
