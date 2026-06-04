/**
 * `sigil setup [--quickstart]` — the tiered onboarding entry point.
 *
 * The QuickStart path is non-interactive and dependency-free: it picks the
 * embedded PGlite database (no Postgres, no Docker), a keyless LLM provider
 * (Claude Code) when available, a local Ollama embedder when reachable, and
 * names you from $USER. Everything routes through the SAME headless step engine
 * the GUI drives (src/setup/service.js), so CLI and GUI can never diverge.
 *
 * Mirrors the "QuickStart vs Advanced" pattern: `sigil setup` with no flag (or
 * `--advanced`) points at the full pickers; `--quickstart` takes the defaults.
 *
 *   sigil setup --quickstart [--name "Ada"] [--embedding-key sk-...] [--yes]
 *
 * Flags:
 *   --quickstart        Non-interactive defaults path (this handler).
 *   --name <name>       Identity to store (default: OS username).
 *   --embedding-key <k> Use OpenAI embeddings with this key instead of Ollama.
 *   --yes               Proceed without the one confirmation prompt.
 */
import { userInfo } from 'node:os';

import { patchConfig } from '../setup/config-store.js';
import { detectRunningDaemon } from '../daemon/lifecycle.js';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function flagValue(args, name) {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const tok = args[i];
  return tok.includes('=') ? tok.split('=').slice(1).join('=') : args[i + 1];
}

const ok = (label, detail = '') => console.log(`  ${C.green('✓')} ${label}${detail ? C.dim(`  ${detail}`) : ''}`);
const warn = (label) => console.log(`  ${C.yellow('!')} ${label}`);
const fail = (label) => console.log(`  ${C.red('✗')} ${label}`);

export async function runSetup(args = []) {
  if (args.includes('--help') || args.includes('-h')) return printHelp();

  // Default to quickstart when explicitly asked; otherwise point at the pickers.
  if (!args.includes('--quickstart')) {
    console.log(`${C.bold('sigil setup')} — choose a path:\n`);
    console.log(`  ${C.bold('sigil setup --quickstart')}   ${C.dim('zero-config: embedded DB + local embedder')}`);
    console.log(`  ${C.bold('sigil init')}                 ${C.dim('interactive wizard (full control)')}`);
    console.log(`  ${C.bold('sigil')}                      ${C.dim('open the web setup wizard in your browser')}\n`);
    return;
  }

  return runQuickstart(args);
}

async function runQuickstart(args) {
  console.log(`\n${C.bold('Sigil QuickStart')} ${C.dim('— zero-config setup')}\n`);

  // Single-process guard: PGlite (embedded mode) can only be held by one
  // process. If a daemon is already serving, it owns the engine — running
  // migrations from this CLI process would conflict.
  const daemonPid = await detectRunningDaemon();
  if (daemonPid) {
    fail(`A Sigil daemon is already running (pid ${daemonPid}).`);
    console.log(`    ${C.dim('Embedded mode is single-process. Stop it first:')} ${C.bold('sigil daemon stop')}\n`);
    process.exitCode = 1;
    return;
  }

  // Set embedded mode BEFORE the setup service (and its cortex import) loads, so
  // the DB pool is built against the in-process engine from the first query.
  patchConfig('database', { mode: 'embedded' });

  const { runStep, detectStep, getSetupState } = await import('../setup/service.js');
  const log = (p) => p?.label && process.stdout.write(`    ${C.dim(p.label)}\r`);

  // 1) Database — embedded PGlite (Postgres 17 + pgvector, in-process).
  const db = await runStep('database', { mode: 'embedded' });
  process.stdout.write('\r\x1b[K');
  if (!db.ok) return abort('Database', db);
  ok('Embedded database ready', `${db.result.migrationsRan} migrations · ${db.result.dataDir}`);

  // 2) LLM — keyless Claude Code when present; non-fatal if it isn't.
  const llm = await runStep('llm', { provider: 'claude-cli' });
  process.stdout.write('\r\x1b[K');
  if (llm.ok) ok('LLM provider', 'Claude Code (no API key)');
  else warn(`LLM step skipped (${llm.error}) — set one later in the GUI`);

  // 3) Embeddings — OpenAI if a key was passed, else local Ollama if reachable.
  const embKey = flagValue(args, 'embedding-key');
  let emb;
  if (embKey) {
    emb = await runStep('embedding', { provider: 'openai', apiKey: embKey });
  } else {
    const det = await detectStep('embedding');
    if (det?.ollama?.reachable) {
      emb = await runStep('embedding', { provider: 'ollama' }); // auto-pulls the model
    } else {
      process.stdout.write('\r\x1b[K');
      warn('No embedder configured — Ollama not reachable and no --embedding-key given.');
      console.log(`    ${C.dim('Finish with either:')}`);
      console.log(`      ${C.bold('ollama serve')} ${C.dim('then re-run')} ${C.bold('sigil setup --quickstart')}`);
      console.log(`      ${C.bold('sigil setup --quickstart --embedding-key sk-...')} ${C.dim('(OpenAI)')}\n`);
      summarize(getSetupState());
      return;
    }
  }
  process.stdout.write('\r\x1b[K');
  if (!emb.ok) return abort('Embeddings', emb);
  ok('Embedder ready', `${emb.result.provider}/${emb.result.model} · ${emb.result.dim}d`);

  // 4) Connectors — no-op apply (agents are connected individually in the GUI).
  await runStep('connectors', {});
  ok('Coding agents', 'connect them anytime in the dashboard');

  // 5) Identity — exercises the FULL pipeline (classify + embed + DB write).
  const name = (flagValue(args, 'name') || userInfo().username || '').trim();
  const idr = await runStep('identity', { name });
  process.stdout.write('\r\x1b[K');
  if (!idr.ok) return abort('Identity', idr);
  ok('First memory written', `as "${name}" · full pipeline verified`);

  console.log('');
  summarize(getSetupState());
}

function abort(stepTitle, res) {
  process.stdout.write('\r\x1b[K');
  fail(`${stepTitle} failed: ${res.error || JSON.stringify(res.errors)}`);
  if (res.hint) console.log(`    ${C.dim('→ ' + res.hint)}`);
  process.exitCode = 1;
}

function summarize(state) {
  const done = state.steps.filter((s) => s.status === 'done').length;
  if (state.complete) {
    console.log(`${C.green(C.bold('✓ Sigil is ready.'))} Run ${C.bold('sigil')} to open the dashboard.\n`);
  } else {
    const pending = state.steps.filter((s) => s.status !== 'done').map((s) => s.title);
    console.log(`${C.yellow(`${done}/${state.steps.length} steps done.`)} Remaining: ${pending.join(', ')}.`);
    console.log(`Finish in the browser: ${C.bold('sigil')}\n`);
  }
}

function printHelp() {
  console.log(`sigil setup — first-run onboarding

Usage:
  sigil setup                                  Show the QuickStart vs interactive choice
  sigil setup --quickstart                     Zero-config: embedded DB + local embedder
  sigil setup --quickstart --name "Ada"        ...with an explicit name
  sigil setup --quickstart --embedding-key sk- ...using OpenAI embeddings instead of Ollama

QuickStart defaults:
  Database    embedded PGlite (Postgres 17 + pgvector, in-process — no server, no Docker)
  LLM         Claude Code (keyless) when available
  Embeddings  local Ollama (auto-pulled) — or OpenAI with --embedding-key
  Name        your OS username (override with --name)

Notes:
  Embedded mode is single-process — stop a running daemon first (sigil daemon stop).
  For full control over every choice, use the interactive wizard: sigil init`);
}
