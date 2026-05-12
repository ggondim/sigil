#!/usr/bin/env node

/**
 * SessionEnd hook — closes the active session pod when Claude Code
 * signals the session is ending.
 *
 * Receives on stdin (JSON):
 *   { session_id, transcript_path?, reason?, summary?, ... }
 *
 * Effects:
 *   - Sets pod.ended_at on the matching session pod.
 *   - Writes `attrs.conclusion` / `attrs.summary` if Claude provided them.
 *   - Removes ~/.sigil/.active-session.json so the next session starts
 *     fresh.
 *
 * If session_id is missing or the cursor doesn't match it, this is a
 * no-op — hot-context staleness sweep in `sigil maintain` will close
 * any pod whose started_at is older than 6h.
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

const home = process.env.HOME || process.env.USERPROFILE;
const globalEnv = join(home, '.sigil', '.env');
const localEnv = resolve(process.cwd(), '.env');
if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
else if (existsSync(globalEnv)) dotenvConfig({ path: globalEnv, quiet: true });

async function main() {
  const raw = await readStdin();
  if (!raw) return respond();

  let input;
  try { input = JSON.parse(raw); } catch { return respond(); }

  try {
    if (!input.session_id) return respond();

    const { endActiveSession, getActiveCursor } = await import('../memory/pods/active-session.js');
    const cursor = await getActiveCursor();

    // Only end if the cursor matches the session that just stopped.
    // Avoids closing the wrong pod if SessionEnd fires for a different
    // session than the one currently tracked.
    if (!cursor || cursor.session_id !== input.session_id) return respond();

    await endActiveSession({
      conclusion: input.summary || input.conclusion || null,
      summary: input.summary || null,
    });
  } catch (err) {
    process.stderr.write(`[sigil:session-end] ${err.message}\n`);
  } finally {
    try {
      const cortexDb = (await import('../db/cortex.js')).default;
      await cortexDb.destroy();
    } catch { /* ignore */ }
  }

  return respond();
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function respond() {
  process.stdout.write('{}');
}

main();
