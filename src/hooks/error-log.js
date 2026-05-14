/**
 * Shared hook error log — every hook writes failures to a single
 * ~/.sigil/.hook-errors.log file. `sigil doctor` reads this to surface
 * recent failures so problems don't silently rot in production.
 *
 * One line per error, JSON, append-only. Rotated only by manual
 * truncation (it's diagnostic, low-volume, single-machine).
 */

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export const HOOK_ERROR_LOG = join(homedir(), '.sigil', '.hook-errors.log');

export async function recordHookError(hook, err, input = null) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      hook,
      error: err?.message || String(err),
      input_hash: input ? hashInput(input) : null,
    };
    await appendFile(HOOK_ERROR_LOG, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Never let log-writing crash a hook
  }
}

export async function readRecentHookErrors(limit = 10) {
  let raw;
  try {
    raw = await readFile(HOOK_ERROR_LOG, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines.slice(-limit)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function hashInput(input) {
  try {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return createHash('sha256').update(str).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}
