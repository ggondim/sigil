#!/usr/bin/env node

/**
 * SessionEnd hook — synthesizes a summary fact, then closes the active
 * session pod.
 *
 * Receives on stdin (JSON):
 *   { session_id, transcript_path?, reason?, summary?, cwd?, ... }
 *
 * Effects (in order):
 *   1. Resolve the active session pod via cursor (or skip if it doesn't
 *      match input.session_id).
 *   2. List facts already attached to the session pod. If there are
 *      enough (≥3), call the LLM to synthesize a one-fact summary using
 *      the claude_session.schema.md authoring guide. Save it via
 *      ingestDocument with classify:false and attach to all active
 *      kinds' pods (session + project, automatic via dispatcher).
 *   3. End the session pod (attrs.conclusion/summary written, ended_at
 *      stamped, cursor removed).
 *
 * If session_id is missing or the cursor doesn't match, this is a
 * no-op — hot-context staleness sweep in `sigil maintain` closes any
 * pod whose started_at is older than 6h.
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

const home = process.env.HOME || process.env.USERPROFILE;
const globalEnv = join(home, '.sigil', '.env');
const localEnv = resolve(process.cwd(), '.env');
if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
else if (existsSync(globalEnv)) dotenvConfig({ path: globalEnv, quiet: true });

const MIN_FACTS_TO_SYNTHESIZE = 3;
const MAX_FACTS_IN_PROMPT = 40;

async function main() {
  const raw = await readStdin();
  if (!raw) return respond();

  let input;
  try { input = JSON.parse(raw); } catch { return respond(); }

  try {
    if (!input.session_id) return respond();

    const { endActiveSession, getActiveCursor } = await import('../memory/pods/active-session.js');
    const cursor = await getActiveCursor();

    // Only act if the cursor matches the session that just stopped.
    if (!cursor || cursor.session_id !== input.session_id) return respond();

    // Try synthesis BEFORE closing the pod. Best-effort: synthesis failure
    // does not block the close.
    try {
      await synthesizeSummary({
        sessionPodUid: cursor.pod_uid,
        cwd: input.cwd || cursor.cwd || null,
        sessionId: input.session_id,
        transcriptPath: input.transcript_path || cursor.transcript_path || null,
      });
    } catch (err) {
      process.stderr.write(`[sigil:session-end] synthesis failed: ${err.message}\n`);
    }

    await endActiveSession({
      conclusion: input.summary || input.conclusion || null,
      summary: input.summary || null,
    });
  } catch (err) {
    process.stderr.write(`[sigil:session-end] ${err.message}\n`);
    try {
      const { recordHookError } = await import('./error-log.js');
      await recordHookError('session-end', err, input);
    } catch { /* ignore */ }
  } finally {
    try {
      const cortexDb = (await import('../db/cortex.js')).default;
      await cortexDb.destroy();
    } catch { /* ignore */ }
  }

  return respond();
}

async function synthesizeSummary({ sessionPodUid, cwd, sessionId, transcriptPath }) {
  if (!sessionPodUid) return;

  const podStore = await import('../memory/pods/store.js');
  const podMembership = await import('../memory/pods/membership.js');
  const sessionPod = await podStore.findByUid(sessionPodUid);
  if (!sessionPod) return;

  // Pull facts attached to this session pod via the existing listMembers
  // helper. Sorted by attach order — most recent at the end of the array.
  const memberRows = await podMembership.listMembers(sessionPod.id, {
    memberType: 'fact',
    limit: MAX_FACTS_IN_PROMPT,
  });
  if (memberRows.length < MIN_FACTS_TO_SYNTHESIZE) return;

  // listMembers returns the join row + the fact content via the table
  // join; verify shape and pluck content.
  const factTexts = memberRows
    .map((r) => r.content || r.fact_content || r.factContent)
    .filter(Boolean);
  if (factTexts.length < MIN_FACTS_TO_SYNTHESIZE) return;

  const { promptJson } = await import('../lib/llm.js');
  const { get, getSchemaDoc } = await import('../memory/pods/registry.js');
  await import('../memory/pods/kinds/index.js'); // ensure registered

  const kind = get('claude_session');
  const schemaDoc = (await getSchemaDoc(kind)) || '';

  const prompt = [
    'You are writing the durable end-of-session summary for a Claude Code session.',
    '',
    'Schema guide (how to write facts for the claude_session kind):',
    schemaDoc.slice(0, 2000),
    '',
    'Session facts gathered during this session:',
    factTexts.map((f, i) => `  ${i + 1}. ${f}`).join('\n'),
    '',
    'Write ONE summary fact (60-220 chars) that captures the single most useful thing a future session in the same project would want to know about this one. Past tense. Specific. No filler. Do not repeat individual facts verbatim — synthesize the essence.',
    '',
    'Return JSON: { "summary": "<one-line summary fact>", "topics": ["...", "..."] }',
  ].join('\n');

  let out;
  try {
    out = await promptJson(prompt, { caller: 'session-end-synth' });
  } catch {
    return;
  }
  const summary = typeof out?.summary === 'string' ? out.summary.trim() : null;
  if (!summary || summary.length < 30) return;

  // Save as a fact via the regular ingestion pipeline, classify=false so
  // the LLM extractor is skipped (we're already providing the final fact
  // text). Attach to all active kinds' pods — dispatcher returns
  // session + project, and the project pod gets the durable copy.
  const { ensureActivePodsForHook } = await import('../memory/pods/hook-dispatcher.js');
  const { podUids } = await ensureActivePodsForHook({
    sessionId,
    cwd,
    transcriptPath,
  });

  const { ingestDocument } = await import('../ingestion/pipeline.js');
  const config = (await import('../config.js')).default;

  try {
    await ingestDocument({
      content: summary,
      namespace: config.defaults.namespace,
      classify: false,
      podUids,
    });
  } catch (err) {
    process.stderr.write(`[sigil:session-end] save summary failed: ${err.message}\n`);
  }
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
