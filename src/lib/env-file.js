/**
 * Read/write helpers for ~/.sigil/.env — the single config file shared by the
 * CLI, daemon, and GUI. Extracted from daemon/handlers/onboarding.js so the
 * onboarding state machine (src/onboarding/state.js) can reconcile against the
 * same file without importing the handler (avoids a cycle).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { SIGIL_ENV_PATH } from './paths.js';

export function readEnvRaw() {
  if (!existsSync(SIGIL_ENV_PATH)) return {};
  const raw = readFileSync(SIGIL_ENV_PATH, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const v = m[2].trim();
    out[m[1]] = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
      ? v.slice(1, -1)
      : v;
  }
  return out;
}

/**
 * Merge `patch` into ~/.sigil/.env. A key set to null/undefined is removed.
 * Preserves all keys not mentioned in the patch.
 */
export function writeEnvKeys(patch) {
  const cur = readEnvRaw();
  const next = { ...cur, ...patch };
  for (const k of Object.keys(patch)) {
    if (patch[k] === null || patch[k] === undefined) delete next[k];
  }
  mkdirSync(dirname(SIGIL_ENV_PATH), { recursive: true });
  const header = `# Sigil — updated ${new Date().toISOString().slice(0, 10)}\n`;
  const body = Object.entries(next)
    .map(([k, v]) => `${k}=${/[\s#"']/.test(String(v)) ? `"${String(v).replace(/"/g, '\\"')}"` : v}`)
    .join('\n');
  writeFileSync(SIGIL_ENV_PATH, header + body + '\n', 'utf8');
}
