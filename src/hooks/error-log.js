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

// Config gate — every hook calls this at startup. Returns true if the
// hook should bail (config has known-broken combinations like
// EMBEDDING_PROVIDER=voyage + EMBEDDING_MODEL=nomic-embed-text). On
// bail, logs the specific issue + fix command to .hook-errors.log so
// the user sees actionable diagnostics instead of an upstream 4xx.
//
// Returns false (proceed) if the validator import fails — we never
// want validator bugs to block hooks.
export async function failClosedOnBadConfig(hookName, rawInput = null) {
  try {
    const { validateConfig } = await import('../lib/config-validator.js');
    const fails = validateConfig().filter((i) => i.level === 'fail');
    if (fails.length === 0) return false;
    for (const i of fails) {
      const err = new Error(`${i.code}: ${i.message} — fix: ${i.fix}`);
      await recordHookError(hookName, err, rawInput);
    }
    return true;
  } catch {
    return false;
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
