#!/usr/bin/env node

/**
 * Stop hook — auto-extracts memorable content from the last user message
 * after Claude finishes a turn.
 *
 * Why this exists: relying on Claude to call `sigil remember` proactively is
 * unreliable. The model sometimes saves preferences and decisions, sometimes
 * doesn't. This hook is the safety net — it runs after every assistant turn
 * completes, scans the latest user message with a small LLM classifier, and
 * saves anything memorable through the same AUDM pipeline `sigil remember`
 * uses. Duplicates are deduped automatically.
 *
 * Cost: one Haiku call per turn (~$0.0001, ~300ms). Runs async after the
 * user has already seen Claude's response, so user-facing latency is zero.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { config as dotenvConfig } from 'dotenv';

// Load env before anything else
const home = process.env.HOME || process.env.USERPROFILE;
const globalEnv = join(home, '.sigil', '.env');
const localEnv = resolve(process.cwd(), '.env');
if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
else if (existsSync(globalEnv)) dotenvConfig({ path: globalEnv, quiet: true });

const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 8000;
const CURSOR_PATH = join(home, '.sigil', '.stop-cursor.json');

async function main() {
  const raw = await readStdin();
  if (!raw) return respond();

  let input;
  try { input = JSON.parse(raw); } catch { return respond(); }

  const userMessage = await extractLastUserMessage(input);
  if (!userMessage) return respond();
  if (userMessage.length < MIN_MESSAGE_LENGTH) return respond();
  if (userMessage.length > MAX_MESSAGE_LENGTH) return respond();

  // Skip if we already processed this exact message
  const messageHash = sha256(userMessage);
  if (alreadyProcessed(messageHash)) return respond();

  try {
    const facts = await classifyTurn(userMessage);
    markProcessed(messageHash);

    if (!facts.length) return respond();

    // Resolve (or create) the session pod for this Claude Code session.
    // Hooks always receive session_id in the stdin envelope; on the rare
    // case it's missing, we fall through without a pod and the save still
    // succeeds — just without session attribution.
    let sessionPodUid = null;
    try {
      if (input.session_id) {
        const { ensureActiveSession } = await import('../memory/pods/active-session.js');
        const pod = await ensureActiveSession({
          sessionId: input.session_id,
          transcriptPath: input.transcript_path || null,
          cwd: input.cwd || null,
        });
        sessionPodUid = pod?.uid || null;
      }
    } catch (err) {
      process.stderr.write(`[sigil:stop] session pod resolve failed: ${err.message}\n`);
    }

    await saveFacts(facts, { sessionPodUid });
  } catch (err) {
    // Never block Claude — fail silently
    process.stderr.write(`[sigil:stop] ${err.message}\n`);
  } finally {
    // Tear down the DB connection so Node exits cleanly
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
  // Stop hook: empty JSON response is fine — we never want to block stop
  process.stdout.write('{}');
}

// ─── Find the last user message from whatever Claude Code sends ──────────

async function extractLastUserMessage(input) {
  // Path 1: transcript file (Claude Code's standard Stop hook input shape)
  if (input.transcript_path && existsSync(input.transcript_path)) {
    const msg = readLastUserMessageFromTranscript(input.transcript_path);
    if (msg) return msg;
  }

  // Path 2: explicit messages array
  if (Array.isArray(input.messages)) {
    for (let i = input.messages.length - 1; i >= 0; i--) {
      const m = input.messages[i];
      if ((m.role === 'user' || m.message?.role === 'user') && m.content) {
        return contentToText(m.content);
      }
    }
  }

  // Path 3: direct fields some hosts use
  if (typeof input.last_user_message === 'string') return input.last_user_message;
  if (typeof input.user_message === 'string') return input.user_message;
  if (typeof input.prompt === 'string') return input.prompt;

  return null;
}

function readLastUserMessageFromTranscript(path) {
  let lines;
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }

    // Claude Code transcript entries typically have shape:
    //   { type: "user", message: { role: "user", content: "..." } }
    // or { role: "user", content: "..." }
    const role = entry.role || entry.message?.role || entry.type;
    if (role !== 'user') continue;

    const content = entry.content ?? entry.message?.content;
    const text = contentToText(content);
    // Skip tool_result entries that masquerade as user messages
    if (text && !looksLikeToolResult(text)) return text;
  }
  return null;
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function looksLikeToolResult(text) {
  // Heuristic — Claude Code wraps tool outputs with these prefixes
  return /^<tool_use_result|^<bash_output|^<file_contents|^Tool execution result/.test(text);
}

// ─── Cursor — skip already-processed messages ────────────────────────────

function alreadyProcessed(hash) {
  if (!existsSync(CURSOR_PATH)) return false;
  try {
    const cursor = JSON.parse(readFileSync(CURSOR_PATH, 'utf8'));
    return cursor.lastHash === hash;
  } catch {
    return false;
  }
}

function markProcessed(hash) {
  try {
    mkdirSync(dirname(CURSOR_PATH), { recursive: true });
    writeFileSync(CURSOR_PATH, JSON.stringify({ lastHash: hash, ts: Date.now() }), 'utf8');
  } catch { /* best effort */ }
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ─── Classifier — single LLM call deciding what to save ──────────────────

const CLASSIFIER_PROMPT = `You decide whether a user's message contains durable, memorable content for a long-term AI memory system, and extract the facts if so.

SAVE these signals:
- Preferences ("I prefer X", "I always X", "I never X", "I like X")
- Decisions ("we use X", "we picked X", "we don't use X", "we moved off X")
- Constraints ("we can't use X because…", "X is blocked", "X must support Y")
- Corrections ("actually it's X, not Y", "we changed X to Y")
- Factual claims about the user's project, codebase, team, tools, or conventions

DO NOT save:
- Questions or code requests ("write me a X", "how do I Y", "fix this")
- Casual chitchat or greetings ("ok", "thanks", "hi")
- Ephemeral context that won't generalize ("this file", "this branch", "this run")
- Generic claims about the world ("Python is interpreted", "git is version control")
- Commands or instructions to Claude itself ("be more careful", "don't apologize")

Each saved fact must:
- Be a complete declarative statement that makes sense without the surrounding conversation
- Stay under 25 words
- Be specific enough that retrieving it later helps Claude answer better
- Be phrased in third person where natural ("User prefers X" or "Project uses X")

Respond as STRICT JSON, no markdown:
{"memorable": boolean, "facts": ["...", "..."]}

If "memorable" is false, "facts" must be an empty array.`;

async function classifyTurn(userMessage) {
  const { promptJson } = await import('../lib/llm.js');
  const config = (await import('../config.js')).default;

  const input = `${CLASSIFIER_PROMPT}\n\n---\nUser message:\n${userMessage}`;

  const result = await promptJson(input, {
    model: config.llm.extractionModel,
    caller: 'stop-hook',
  });

  if (!result || result.memorable !== true) return [];
  if (!Array.isArray(result.facts)) return [];

  return result.facts
    .filter((f) => typeof f === 'string')
    .map((f) => f.trim())
    .filter((f) => f.length >= 8 && f.length <= 200);
}

// ─── Save through the regular AUDM pipeline ──────────────────────────────

async function saveFacts(facts, { sessionPodUid = null } = {}) {
  const { ingestDocument } = await import('../ingestion/pipeline.js');
  const config = (await import('../config.js')).default;

  const podUids = sessionPodUid ? [sessionPodUid] : [];

  // Run sequentially so PGlite (single-process) doesn't get hammered
  for (const fact of facts) {
    try {
      await ingestDocument({
        content: fact,
        namespace: config.defaults.namespace,
        // Skip the LLM classifier inside the pipeline — we already classified.
        // The fact-extraction step still runs.
        classify: false,
        podUids,
      });
    } catch (err) {
      process.stderr.write(`[sigil:stop] save failed: ${err.message}\n`);
    }
  }

  // Refresh hot-context so the new fact shows up at next session start
  try {
    const { updateContextSnapshot } = await import('../memory/facts/hot-context.js');
    await updateContextSnapshot({ namespace: config.defaults.namespace });
  } catch { /* best effort */ }
}

main();
