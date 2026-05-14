#!/usr/bin/env node

/**
 * UserPromptSubmit hook — injects relevant Sigil facts into Claude's context.
 *
 * Reads the user's prompt from stdin (JSON from Claude Code), searches
 * Sigil with the prompt as query, and returns the top facts as
 * additionalContext for Claude.
 *
 * 0.10.0:
 *   • route + expand turned ON — the query router (which existed but was
 *     bypassed) now classifies the query and adjusts search params
 *     (categories, limit, useGraph, expand variants).
 *   • podScope='auto' — search is now scoped to active session + project
 *     + person pods via the registry, falling back to global for queries
 *     that the active scope doesn't cover.
 *   • Token budget — INJECTION_BUDGET_CHARS caps the total injected
 *     payload at ~1200 tokens (4 chars/token approx), preferred over the
 *     old fixed MAX_FACTS so retrieval-rich queries get more facts and
 *     long-fact queries don't blow the budget.
 *   • synthesize stays OFF here — synthesis adds 1-3s + an LLM call to
 *     every user message and steals the citation surface from Claude.
 *     Phase 2 will revisit if router signal warrants it.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

import { maskSecrets } from './secret-mask.js';
import { recordHookError } from './error-log.js';

// Load env before anything else
const home = process.env.HOME || process.env.USERPROFILE;
const globalEnv = join(home, '.sigil', '.env');
const localEnv = resolve(process.cwd(), '.env');
if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
else if (existsSync(globalEnv)) dotenvConfig({ path: globalEnv, quiet: true });

const MIN_QUERY_LENGTH = 8;
const MAX_FACTS = 20;
const INJECTION_BUDGET_CHARS = 4800; // ~1200 tokens

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return respond();

  const input = JSON.parse(raw);
  const query = input.prompt || '';

  // Skip short/trivial prompts
  if (query.length < MIN_QUERY_LENGTH) return respond();

  try {
    const { search } = await import('../memory/search/hybrid.js');
    const config = (await import('../config.js')).default;

    let result;
    try {
      result = await search(query, {
        namespaces: [config.defaults.namespace],
        limit: MAX_FACTS,
        useGraph: false, // router promotes to true when warranted
        route: true,
        expand: true,
        synthesize: false,
        podScope: 'auto',
        ctx: {
          cwd: input.cwd || null,
          sessionId: input.session_id || null,
        },
      });
    } catch (searchErr) {
      // If pod-scoped search yields nothing (or errors on empty scope),
      // fall through to a global search so the hook still surfaces facts
      // for fresh installs / pre-pod data.
      process.stderr.write(`[sigil:user-prompt-submit] pod-scoped search failed, retrying global: ${searchErr.message}\n`);
      result = await search(query, {
        namespaces: [config.defaults.namespace],
        limit: MAX_FACTS,
        useGraph: false,
        route: true,
        expand: true,
        synthesize: false,
        podScope: 'global',
      });
    }

    let facts = result?.facts || [];

    // If pod-scoped search returned nothing but we asked for 'auto', try
    // global as a fallback (e.g., user just installed and has no pods yet).
    if (facts.length === 0) {
      try {
        const fallback = await search(query, {
          namespaces: [config.defaults.namespace],
          limit: MAX_FACTS,
          useGraph: false,
          route: true,
          expand: true,
          synthesize: false,
          podScope: 'global',
        });
        facts = fallback?.facts || [];
      } catch { /* keep facts as empty */ }
    }

    if (!facts.length) {
      const cortexDb = (await import('../db/cortex.js')).default;
      await cortexDb.destroy();
      return respond();
    }

    // Apply token budget — take facts in score order until the cumulative
    // char count would exceed budget. Always take at least one fact even
    // if it's over budget alone (better than no signal).
    const chosen = [];
    let used = 0;
    for (const f of facts) {
      const len = (f.content || '').length + 4; // "- " prefix + newline
      if (chosen.length > 0 && used + len > INJECTION_BUDGET_CHARS) break;
      chosen.push(f);
      used += len;
    }

    const context = maskSecrets([
      `Sigil memory (${chosen.length} relevant facts):`,
      ...chosen.map((f) => `- ${f.content}`),
    ].join('\n'));

    const cortexDb = (await import('../db/cortex.js')).default;
    await cortexDb.destroy();
    return respond(context);
  } catch (err) {
    // Never block Claude — fail silently, but log so sigil doctor can surface it
    process.stderr.write(`[sigil:user-prompt-submit] ${err.message}\n`);
    await recordHookError('user-prompt-submit', err, raw);
    try {
      const cortexDb = (await import('../db/cortex.js')).default;
      await cortexDb.destroy();
    } catch { /* ignore */ }
    return respond();
  }
}

function respond(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      ...(additionalContext && { additionalContext }),
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main();
