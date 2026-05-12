#!/usr/bin/env node

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync as _execSync, spawn as _spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

// Package root — works whether run from project dir or globally installed
const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// Env precedence: shell env > project .env > global ~/.sigil/.env.
// dotenv's default behavior (no `override`) never overwrites existing
// process.env keys, so loading project FIRST gives it priority over
// global, and shell-set values (e.g. `DEFAULT_NAMESPACE=demo sigil ...`)
// always win because they're set before either dotenv call runs.
const projectEnv = resolve(process.cwd(), '.env');
const globalEnv = join(homedir(), '.sigil', '.env');

if (existsSync(projectEnv)) {
  dotenvConfig({ path: projectEnv, quiet: true });
}
if (existsSync(globalEnv) && globalEnv !== projectEnv) {
  dotenvConfig({ path: globalEnv, quiet: true });
}

const [command, ...rest] = process.argv.slice(2);

const HELP = `sigil — Persistent memory for your Claude sessions

Usage:
  sigil <command> [options]

Commands:
  init [--dry-run]         Set up Sigil (DB, env, hooks, Claude integration)
  doctor                   Diagnose Sigil setup (DB, LLM, embeddings, hooks)
  remember "text"          Save a fact or note to memory
  ingest <file|url|glob>   Ingest documents into the knowledge base
  search "query"           Search the knowledge base
  facts                    List stored facts with IDs
  forget <id>              Delete a specific fact by ID
  namespace <sub>          Manage namespaces (list | delete <ns>)
  session <sub>            Inspect the active session pod (current | list | show)
  pod <sub>                List, show, create, or archive memory pods
  export [--format=json]   Export knowledge base as JSON or Markdown
  context                  Refresh the hot-context snapshot in ~/.claude/CLAUDE.md
  status                   Show knowledge base statistics
  maintain                 Run periodic memory maintenance (stage promotion, edge consolidation)
  migrate                  Run database migrations
  reset                    Reset the database (drops all data)
  register                 Register as a Claude Code MCP server (advanced)

Options:
  --help                   Show this help message

Run sigil <command> --help for command-specific options.`;

if (!command || command === '--help' || command === '-h') {
  console.log(HELP);
  process.exit(0);
}

const commands = {
  init: runInit,
  doctor: runDoctor,
  remember: runRemember,
  ingest: runIngest,
  search: runSearch,
  context: runContext,
  status: runStatus,
  facts: runFacts,
  forget: runForget,
  namespace: runNamespace,
  session: runSession,
  pod: runPod,
  export: runExport,
  maintain: runMaintain,
  migrate: runMigrate,
  reset: runReset,
  register: runRegister,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}\n`);
  console.log(HELP);
  process.exit(1);
}

try {
  await handler(rest);
} catch (err) {
  // PGlite Aborted() at startup means the on-disk DB has stale lock state or
  // dirty WAL. The bare WASM trace tells the user nothing useful — surface the
  // recovery command instead.
  const msg = err.message || String(err);
  if (/Aborted\(\)|RuntimeError|wasm-function/i.test(msg)) {
    console.error('Error: Sigil DB failed to start (likely stale lock or dirty WAL state).');
    console.error('');
    console.error('Recovery:');
    console.error("  1. Make sure no other Sigil process is running:  ps aux | grep sigil");
    console.error("  2. Try the auto-cleaner:                          sigil doctor --kill-stale");
    console.error("  3. If that fails, the DB may be corrupted:        ls -la ~/.sigil/db");
    console.error('');
    console.error('Underlying error: ' + msg.split('\n')[0]);
    process.exit(1);
  }
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function runInit(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`sigil init — Set up Sigil (DB, env, hooks, Claude integration)

Usage:
  sigil init [--dry-run]

Options:
  --dry-run    Walk through every prompt and print the exact files that would
               be created or modified, but write nothing to disk. Use this on
               first install to preview the changes Sigil will make to your
               ~/.sigil/ and ~/.claude/ directories.

Files Sigil touches (originals are backed up to <path>.sigil.bak before write):
  ~/.sigil/.env                 Sigil config + API keys
  ~/.sigil/CLAUDE.md            Sigil instructions for Claude
  ~/.sigil/db/                  Embedded PGlite database
  ~/.claude/CLAUDE.md            One @import line added (existing content preserved)
  ~/.claude/settings.json        UserPromptSubmit + PostToolUse hook entries (merged)`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');

  const clack = await import('@clack/prompts');
  const fs = await import('node:fs/promises');
  const { safeWrite } = await import('./lib/safe-write.js');
  const { intro, outro, select, text, spinner, confirm, note, cancel, isCancel } = clack;

  const cortexHome = join(homedir(), '.sigil');
  const envPath = join(cortexHome, '.env');

  intro(dryRun ? 'Sigil — DRY RUN (no files will be written)' : 'Sigil — persistent memory for Claude');

  const planned = [];
  const planFile = (action, path, detail) => planned.push({ action, path, detail });

  const hasOllama = checkCommand('ollama --version');

  // ── Load existing config ─────────────────────────────────────────────────

  const existing = {};
  if (existsSync(envPath)) {
    const content = await fs.readFile(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && !k.startsWith('#')) existing[k.trim()] = v.join('=').trim();
    }
  }

  // ── LLM provider ─────────────────────────────────────────────────────────

  const llmProvider = await select({
    message: 'LLM provider (for fact extraction and reasoning)',
    options: [
      { value: 'claude-cli', label: 'Claude Code', hint: 'uses your existing subscription — no extra API key' },
      { value: 'openai',     label: 'OpenAI',      hint: 'gpt-4o-mini' },
      { value: 'anthropic',  label: 'Anthropic',   hint: 'Claude Haiku — requires API key' },
      { value: 'ollama',     label: 'Ollama',      hint: 'local models — no API cost' },
    ],
    initialValue: existing.LLM_PROVIDER || 'claude-cli',
  });
  if (isCancel(llmProvider)) { cancel('Setup cancelled.'); process.exit(0); }

  // ── API key ───────────────────────────────────────────────────────────────

  let openaiKey = existing.OPENAI_API_KEY || '';
  let anthropicKey = existing.ANTHROPIC_API_KEY || '';

  if (llmProvider === 'openai') {
    const key = await text({
      message: 'OpenAI API key (paste, then Enter)',
      placeholder: openaiKey ? '(keep existing — press Enter)' : 'sk-proj-...',
      validate: (v) => {
        if (!v && !openaiKey) return 'API key is required';
        if (v && !v.startsWith('sk-')) return 'OpenAI keys start with "sk-" — check paste';
      },
    });
    if (isCancel(key)) { cancel('Setup cancelled.'); process.exit(0); }
    if (key) openaiKey = key;
  } else if (llmProvider === 'anthropic') {
    const key = await text({
      message: 'Anthropic API key (paste, then Enter)',
      placeholder: anthropicKey ? '(keep existing — press Enter)' : 'sk-ant-...',
      validate: (v) => {
        if (!v && !anthropicKey) return 'API key is required';
        if (v && !v.startsWith('sk-ant-')) return 'Anthropic keys start with "sk-ant-" — check paste';
      },
    });
    if (isCancel(key)) { cancel('Setup cancelled.'); process.exit(0); }
    if (key) anthropicKey = key;
  }

  // ── Embeddings ────────────────────────────────────────────────────────────

  const embeddingProvider = await select({
    message: 'Embedding provider (for semantic search)',
    options: [
      { value: 'ollama', label: 'Ollama', hint: 'nomic-embed-text — free, runs locally' },
      { value: 'openai', label: 'OpenAI', hint: 'text-embedding-3-large — requires API key' },
    ],
    initialValue: existing.EMBEDDING_PROVIDER || (hasOllama ? 'ollama' : 'openai'),
  });
  if (isCancel(embeddingProvider)) { cancel('Setup cancelled.'); process.exit(0); }

  // Provider-specific model + dimensions. The DB schema is conditional on
  // EMBEDDING_DIMENSIONS at migrate time (vector(768) by default; upgrade
  // migration fires when EMBEDDING_DIMENSIONS >= 1024). Writing both here
  // BEFORE the migrate step lets the schema match the embedder.
  //
  //   Ollama nomic-embed-text → 768d (matches default schema)
  //   OpenAI text-embedding-3-large → truncated to 1024d via the `dimensions`
  //   parameter (Matryoshka). Migration upgrades schema vector(768) → vector(1024).
  const embeddingDefaults = {
    ollama: { model: 'nomic-embed-text', dimensions: 768 },
    openai: { model: 'text-embedding-3-large', dimensions: 1024 },
  };
  const embeddingModel = existing.EMBEDDING_MODEL || embeddingDefaults[embeddingProvider].model;
  const embeddingDimensions = Number(existing.EMBEDDING_DIMENSIONS) || embeddingDefaults[embeddingProvider].dimensions;

  // ── Ollama health check + model pull ──────────────────────────────────────
  //
  // Three states matter, in order:
  //   1. Binary missing      → block install (no path forward without it)
  //   2. Binary present, server down → spawn `ollama serve` in background, then pull in parallel
  //   3. Server reachable    → pull only if model missing
  //
  // The previous code only checked the binary, so on a fresh `brew install ollama`
  // box (where the daemon isn't auto-started) `ollama list` and `ollama pull`
  // both fail silently and init "succeeds" with a broken embedder.

  if (embeddingProvider === 'ollama') {
    if (!hasOllama) {
      note(
        'Ollama is not installed.\n' +
        'Install from https://ollama.com then run: ollama pull nomic-embed-text\n' +
        'Or re-run sigil init and choose OpenAI for embeddings.',
        'Ollama not found',
      );
      cancel('Install Ollama then re-run sigil init.');
      process.exit(0);
    }

    const ollamaHost = existing.OLLAMA_HOST || 'http://localhost:11434';

    if (dryRun) {
      planFile('check', `ollama server @ ${ollamaHost}`, 'start in background if not running');
      planFile('pull', 'ollama:nomic-embed-text', '~270MB embedding model (if not already present)');
    } else {
      let serverUp = await isOllamaServerRunning(ollamaHost);
      let serveProc = null;

      if (!serverUp) {
        const s = spinner();
        s.start('Starting ollama serve in the background...');
        serveProc = startOllamaServe();
        serverUp = await waitForOllamaServer(ollamaHost, 15000);
        if (serverUp) {
          s.stop(`Ollama server ready (pid ${serveProc?.pid ?? '?'}, background)`);
        } else {
          s.stop('Ollama server did not come up in time');
          note(
            'Sigil tried to start `ollama serve` in the background but it did not\n' +
            'become reachable at ' + ollamaHost + ' within 15s.\n\n' +
            'Open a new terminal, run `ollama serve`, then re-run `sigil init`.',
            'Ollama server unreachable',
          );
          cancel('Start ollama serve manually then re-run sigil init.');
          process.exit(0);
        }
      }

      // Server is up. Check for the model and pull in parallel with serve still running.
      const hasModel = checkCommand('ollama list 2>/dev/null | grep nomic-embed-text');
      if (!hasModel) {
        const pull = await confirm({ message: 'Pull nomic-embed-text embedding model now? (~270MB)' });
        if (isCancel(pull)) { cancel('Setup cancelled.'); process.exit(0); }
        if (pull) {
          const s = spinner();
          s.start('Pulling nomic-embed-text...');
          try {
            _execSync('ollama pull nomic-embed-text', { stdio: 'pipe' });
            s.stop('nomic-embed-text ready');
          } catch {
            s.stop('Pull failed — run: ollama pull nomic-embed-text manually');
          }
        }
      }

      // Detach the background serve so it survives this CLI process exit.
      if (serveProc) serveProc.unref();
    }
  }

  // ── Namespace ─────────────────────────────────────────────────────────────

  const namespace = await text({
    message: 'Default namespace',
    placeholder: 'default',
    initialValue: existing.DEFAULT_NAMESPACE || 'default',
    validate: (v) => { if (!v.trim()) return 'Cannot be empty'; },
  });
  if (isCancel(namespace)) { cancel('Setup cancelled.'); process.exit(0); }

  // ── Write config ──────────────────────────────────────────────────────────

  if (!dryRun) await fs.mkdir(cortexHome, { recursive: true });
  const encryptionKey = existing.CORTEX_ENCRYPTION_KEY || generateSecret(64);

  const envContent = [
    `# Sigil — generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    `LLM_PROVIDER=${llmProvider}`,
    openaiKey    ? `OPENAI_API_KEY=${openaiKey}`       : '# OPENAI_API_KEY=',
    anthropicKey ? `ANTHROPIC_API_KEY=${anthropicKey}` : '# ANTHROPIC_API_KEY=',
    '',
    `EMBEDDING_PROVIDER=${embeddingProvider}`,
    `EMBEDDING_MODEL=${embeddingModel}`,
    `EMBEDDING_DIMENSIONS=${embeddingDimensions}`,
    `OLLAMA_HOST=http://localhost:11434`,
    '',
    `DEFAULT_NAMESPACE=${namespace}`,
    `CORTEX_ENCRYPTION_KEY=${encryptionKey}`,
  ].join('\n');

  const envResult = await safeWrite(envPath, envContent, { dryRun });
  planFile(envResult.action, envPath, `${envResult.bytes} bytes`);

  // ── Database (PGlite — embedded, zero-install) ────────────────────────────

  if (!dryRun) {
    dotenvConfig({ path: envPath, override: true, quiet: true });

    const dbSpinner = spinner();
    dbSpinner.start('Initialising memory database...');
    try {
      const { MIGRATIONS_DIR: migrationDir } = await import('./lib/paths.js');
      const cortexDb = (await import('./db/cortex.js')).default;
      const [, migrations] = await cortexDb.migrate.latest({ directory: migrationDir });
      await cortexDb.destroy();
      dbSpinner.stop(
        migrations.length ? `Memory database ready (${migrations.length} tables created)` : 'Memory database up to date',
      );
    } catch (err) {
      dbSpinner.stop('Database setup failed');
      cancel(err.message);
      process.exit(1);
    }
  } else {
    planFile('create', join(cortexHome, 'db'), 'PGlite database + run migrations');
  }

  // ── ~/.sigil/CLAUDE.md + @import in ~/.claude/CLAUDE.md ─────────────────

  const claudeSpinner = spinner();
  claudeSpinner.start(dryRun ? 'Computing Claude Code integration plan...' : 'Configuring Claude Code integration...');
  const cortexMdResult = await writeSigilMd({ dryRun });
  if (cortexMdResult) planFile(cortexMdResult.action, cortexMdResult.path, `${cortexMdResult.bytes} bytes`);
  const claudeMdResult = await writeClaudeMd({ dryRun });
  if (claudeMdResult) planFile(claudeMdResult.action, claudeMdResult.path, claudeMdResult.detail);
  const hooksResult = await registerHooks({ dryRun });
  if (hooksResult) planFile(hooksResult.action, hooksResult.path, hooksResult.detail);
  if (!dryRun) {
    const { updateContextSnapshot } = await import('./memory/facts/hot-context.js');
    await updateContextSnapshot({ namespace: namespace.toString() }).catch(() => {});
  }
  claudeSpinner.stop(dryRun ? 'Plan computed.' : 'Claude Code integration configured (memory + hooks)');

  // ── Done ──────────────────────────────────────────────────────────────────

  if (dryRun) {
    const lines = planned.map((p) => `  ${pad(p.action, 8)} ${p.path}${p.detail ? `  (${p.detail})` : ''}`);
    note(
      [
        'Dry run — no files were written. The following would happen:',
        '',
        ...lines,
        '',
        'Each existing file would be backed up to <path>.sigil.bak before its first',
        'modification. Re-run without --dry-run to apply.',
      ].join('\n'),
      'Plan',
    );
    outro('Dry run complete.');
    return;
  }

  note(
    [
      `Memory store  ~/.sigil/db  (embedded, no server needed)`,
      `Config        ${envPath}`,
      `Claude        ~/.claude/CLAUDE.md — Sigil is now your memory`,
      `Backups       any pre-existing files saved to <path>.sigil.bak`,
      '',
      'Claude will search Sigil before answering and save important',
      'facts automatically. Start a new Claude session to begin.',
      '',
      'Quick start:',
      '  sigil remember "your first fact"',
      '  sigil ingest <file-or-url>',
      '  sigil search "anything"',
    ].join('\n'),
    'Setup complete',
  );

  outro('Open a new Claude Code session to start using Sigil.');
}

function pad(s, n) { return String(s).padEnd(n); }

// ─── Doctor ─────────────────────────────────────────────────────────────────

async function runDoctor(args) {
  if (args.includes('--help')) {
    console.log(`sigil doctor — Diagnose Sigil setup

Usage:
  sigil doctor [--kill-stale]

Options:
  --kill-stale   Remove stale PGlite lock files (postmaster.pid) when no Sigil
                 process is actually holding them. Use this if 'sigil' commands
                 fail with "Aborted()" after a kill -9 or a previous crash.

Checks: database, LLM provider, embedding provider, hook registration, disk paths.`);
    process.exit(0);
  }

  // --kill-stale: clean stale PGlite lock files and exit. No other diagnostics.
  if (args.includes('--kill-stale')) {
    return killStalePGliteLocks();
  }

  const checks = [];
  const log = (status, label, detail = '') => {
    const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
    checks.push({ status, label });
    console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  console.log('\nSigil diagnostic\n');

  // Config location
  const globalEnv = join(homedir(), '.sigil', '.env');
  if (existsSync(globalEnv)) log('ok', 'Config file', globalEnv);
  else log('warn', 'Config file', `${globalEnv} not found — run 'sigil init'`);

  // Database
  try {
    const cortexDb = (await import('./db/cortex.js')).default;
    const config = (await import('./config.js')).default;
    await cortexDb.raw('SELECT 1');
    log('ok', 'Database', config.db.type === 'postgres' ? 'external Postgres' : `PGlite (${join(homedir(), '.sigil', 'db')})`);

    const { getFactCount } = await import('./memory/facts/store.js');
    const { getStats } = await import('./memory/documents/store.js');
    const [facts, stats] = await Promise.all([getFactCount(), getStats()]);
    log('ok', 'Stored data', `${stats.documentCount} docs, ${stats.totalChunks} chunks, ${facts} facts`);
    await cortexDb.destroy();
  } catch (err) {
    const msg = err.message || String(err);
    if (/Aborted\(\)|RuntimeError|wasm-function/i.test(msg)) {
      log('fail', 'Database', 'PGlite failed to start (stale lock or dirty WAL)');
      log('warn', 'Recovery', "run 'sigil doctor --kill-stale' to clean stale lock files");
    } else {
      log('fail', 'Database', msg);
    }
  }

  // LLM provider
  try {
    const { detectProvider, isOllamaReachable, isClaudeCliAvailable } = await import('./lib/llm/registry.js');
    const config = (await import('./config.js')).default;
    const provider = await detectProvider();

    if (provider === 'anthropic') log('ok', 'LLM provider', `anthropic (API key set)`);
    else if (provider === 'openai') log('ok', 'LLM provider', `openai (API key set)`);
    else if (provider === 'ollama') log('ok', 'LLM provider', `ollama @ ${config.llm.ollamaHost}`);
    else if (provider === 'claude-cli') log('ok', 'LLM provider', 'claude-cli (Claude Code subscription)');
    else log('warn', 'LLM provider', provider);
  } catch (err) {
    log('fail', 'LLM provider', err.message.split('\n')[0]);
  }

  // Embedding provider
  try {
    const { detectEmbeddingProvider } = await import('./lib/llm/registry.js');
    const config = (await import('./config.js')).default;
    const provider = await detectEmbeddingProvider();
    log('ok', 'Embedding provider', `${provider} / ${config.embedding.model}`);
  } catch (err) {
    log('fail', 'Embedding provider', err.message.split('\n')[0]);
  }

  // Claude Code integration
  const claudeSettingsPath = join(homedir(), '.claude', 'settings.json');
  if (existsSync(claudeSettingsPath)) {
    try {
      const fs = await import('node:fs/promises');
      const settings = JSON.parse(await fs.readFile(claudeSettingsPath, 'utf8'));
      const hooks = settings.hooks || {};
      const hasUPS = hooks.UserPromptSubmit?.some((h) => h.hooks?.some((i) => i.command?.includes('sigil') || i.command?.includes('user-prompt-submit')));
      const hasPTU = hooks.PostToolUse?.some((h) => h.hooks?.some((i) => i.command?.includes('sigil') || i.command?.includes('post-tool-use')));
      const hasStop = hooks.Stop?.some((h) => h.hooks?.some((i) => i.command?.includes('sigil') && i.command?.includes('stop.js')));
      if (hasUPS) log('ok', 'UserPromptSubmit hook', 'registered');
      else log('warn', 'UserPromptSubmit hook', `not registered — run 'sigil init' to enable auto-context injection`);
      if (hasPTU) log('ok', 'PostToolUse hook', 'registered');
      else log('warn', 'PostToolUse hook', `not registered — run 'sigil init' to enable auto-capture`);
      if (hasStop) log('ok', 'Stop hook', 'registered (auto-saves memorable user statements)');
      else log('warn', 'Stop hook', `not registered — run 'sigil init' to enable auto-extraction`);
    } catch (err) {
      log('warn', 'Claude Code hooks', `could not parse settings.json: ${err.message}`);
    }
  } else {
    log('warn', 'Claude Code settings', `${claudeSettingsPath} not found`);
  }

  const cortexMd = join(homedir(), '.sigil', 'CLAUDE.md');
  if (existsSync(cortexMd)) log('ok', 'Sigil CLAUDE.md', cortexMd);
  else log('warn', 'Sigil CLAUDE.md', `not found — run 'sigil init'`);

  console.log();
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  if (failed) {
    console.log(`${failed} error${failed > 1 ? 's' : ''}, ${warned} warning${warned !== 1 ? 's' : ''}`);
    process.exit(1);
  } else if (warned) {
    console.log(`All critical checks passed. ${warned} warning${warned > 1 ? 's' : ''}.`);
  } else {
    console.log('All checks passed.');
  }
}

// ─── Doctor: kill-stale subcommand ──────────────────────────────────────────

async function killStalePGliteLocks() {
  const fs = await import('node:fs/promises');
  const dbPath = process.env.SIGIL_PGLITE_PATH || join(homedir(), '.sigil', 'db');
  const lockFile = join(dbPath, 'postmaster.pid');

  console.log(`\nChecking PGlite lock state at ${dbPath}\n`);

  if (!existsSync(lockFile)) {
    console.log('  ✓ No lock file — DB is clean.');
    return;
  }

  // Read the PID from the lock. PGlite writes a synthetic "-N" pid (e.g. "-42")
  // when running in WASM, so any negative or non-integer value means stale.
  let lockBody;
  try {
    lockBody = await fs.readFile(lockFile, 'utf8');
  } catch (err) {
    console.error(`  ✗ Could not read ${lockFile}: ${err.message}`);
    process.exit(1);
  }

  const firstLine = lockBody.split('\n')[0]?.trim();
  const pid = Number(firstLine);
  console.log(`  Lock file contains pid: ${firstLine || '(empty)'}`);

  // PGlite-in-WASM writes a synthetic negative pid (e.g. "-42"). Any value
  // that isn't a positive integer means no real process owns this lock —
  // it's left over from a killed embedded process.
  if (!Number.isInteger(pid) || pid <= 0) {
    await fs.unlink(lockFile);
    console.log(`  ✓ Removed stale PGlite-WASM sentinel lock: ${lockFile}`);
    console.log('');
    console.log('Try your command again. If PGlite still fails to start, the DB may have');
    console.log('dirty WAL state — back up ~/.sigil/db before any further recovery.');
    return;
  }

  // Real OS pid. Check whether that exact process is still alive (kill -0).
  // Don't grep for "sigil" string in arbitrary processes — it's noisy and
  // matches unrelated node processes whose CWD happens to contain "sigil".
  let pidAlive = false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't actually signal
    pidAlive = true;
  } catch {
    pidAlive = false;
  }

  if (pidAlive) {
    console.log(`  ⚠ Process ${pid} is still running. Lock is LIVE, not stale.`);
    console.log('');
    console.log(`  Will NOT remove the lock. Stop pid ${pid} first if it's an orphan, e.g.:`);
    console.log(`      kill ${pid}`);
    process.exit(1);
  }

  // Real pid but process is gone — stale.
  await fs.unlink(lockFile);
  console.log(`  ✓ Removed stale lock for dead pid ${pid}: ${lockFile}`);
  console.log('');
  console.log('Try your command again. If PGlite still fails to start, the DB may have');
  console.log('dirty WAL state — back up ~/.sigil/db before any further recovery.');
}

// ─── Export ──────────────────────────────────────────────────────────────────

async function runExport(args) {
  if (args.includes('--help')) {
    console.log(`sigil export — Export knowledge base to stdout or a file

Usage:
  sigil export [options] [> file]

Options:
  --namespace=<ns>    Filter by namespace
  --format=<fmt>      Output format: json (default) or markdown
  --output=<path>     Write to file instead of stdout`);
    process.exit(0);
  }

  const fs = await import('node:fs/promises');
  const { listFacts } = await import('./memory/facts/store.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1] || config.defaults.namespace;
  const format = args.find((a) => a.startsWith('--format='))?.split('=')[1] || 'json';
  const outputPath = args.find((a) => a.startsWith('--output='))?.split('=')[1];

  const facts = await listFacts({ namespace, limit: 10000 });
  const entities = await cortexDb('entity').where({ namespace });
  const documents = await cortexDb('document').where({ namespace });

  let output;
  if (format === 'markdown') {
    const lines = [`# Sigil export — namespace: ${namespace}`, `Generated: ${new Date().toISOString()}`, ''];
    lines.push(`## Facts (${facts.length})`, '');
    for (const f of facts) {
      const importance = f.importance === 'vital' ? ' **[VITAL]**' : '';
      lines.push(`- **[${f.category}]**${importance} ${f.content} *(${f.confidence})*`);
    }
    lines.push('', `## Entities (${entities.length})`, '');
    for (const e of entities) {
      lines.push(`- **${e.name}** (${e.entityType})${e.description ? ` — ${e.description}` : ''}`);
    }
    lines.push('', `## Documents (${documents.length})`, '');
    for (const d of documents) {
      lines.push(`- ${d.title} (${d.sourcePath})`);
    }
    output = lines.join('\n');
  } else {
    output = JSON.stringify({
      namespace,
      exportedAt: new Date().toISOString(),
      facts: facts.map((f) => ({
        uid: f.uid,
        content: f.content,
        category: f.category,
        confidence: f.confidence,
        importance: f.importance,
        createdAt: f.createdAt,
      })),
      entities: entities.map((e) => ({
        uid: e.uid,
        name: e.name,
        type: e.entityType,
        description: e.description,
        mentionCount: e.mentionCount,
      })),
      documents: documents.map((d) => ({
        sourcePath: d.sourcePath,
        title: d.title,
        sourceType: d.sourceType,
        chunkCount: d.chunkCount,
        factCount: d.factCount,
      })),
    }, null, 2);
  }

  if (outputPath) {
    await fs.writeFile(outputPath, output, 'utf8');
    console.log(`Exported ${facts.length} facts, ${entities.length} entities, ${documents.length} documents to ${outputPath}`);
  } else {
    process.stdout.write(output + '\n');
  }

  await cortexDb.destroy();
}

// ─── Namespace ───────────────────────────────────────────────────────────────

async function runNamespace(args) {
  const sub = args[0];

  if (!sub || args.includes('--help')) {
    console.log(`sigil namespace — Manage namespaces

Usage:
  sigil namespace list
  sigil namespace delete <ns> [--confirm]

Namespaces isolate facts. A project, team, or context each gets its own.`);
    process.exit(sub ? 0 : 1);
  }

  const { listNamespaces, deleteNamespace } = await import('./memory/facts/store.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  if (sub === 'list') {
    const namespaces = await listNamespaces();
    if (!namespaces.length) {
      console.log('No namespaces with facts.');
    } else {
      console.log('Namespaces:');
      for (const { namespace, factCount } of namespaces) {
        console.log(`  ${namespace.padEnd(30)} ${factCount} fact${factCount === 1 ? '' : 's'}`);
      }
    }
  } else if (sub === 'delete') {
    const ns = args[1];
    if (!ns || ns.startsWith('--')) {
      console.error(`Provide a namespace: sigil namespace delete <ns> --confirm`);
      await cortexDb.destroy();
      process.exit(1);
    }
    if (!args.includes('--confirm')) {
      console.error(`This will delete ALL data in namespace "${ns}". Run with --confirm to proceed.`);
      await cortexDb.destroy();
      process.exit(1);
    }
    const result = await deleteNamespace(ns);
    console.log(`Deleted namespace "${ns}":`);
    console.log(`  ${result.factsDeleted} facts, ${result.chunksDeleted} chunks, ${result.docsDeleted} documents, ${result.entitiesDeleted} entities`);
  } else {
    console.error(`Unknown subcommand: ${sub}`);
    await cortexDb.destroy();
    process.exit(1);
  }

  await cortexDb.destroy();
}

// ─── Session ─────────────────────────────────────────────────────────────────

async function runSession(args) {
  const sub = args[0];

  if (!sub || args.includes('--help')) {
    console.log(`sigil session — Inspect the active Claude Code session pod

Usage:
  sigil session current                Show active session uid + summary
  sigil session list [--limit=10]      List recent session pods
  sigil session show [<uid>]           Detailed view (defaults to active)`);
    process.exit(sub ? 0 : 1);
  }

  const cortexDb = (await import('./db/cortex.js')).default;

  try {
    if (sub === 'current') {
      const { getActiveCursor } = await import('./memory/pods/active-session.js');
      const cursor = await getActiveCursor();
      if (!cursor) {
        console.log('No active session.');
        return;
      }
      const pod = await (await import('./memory/pods/store.js')).findByUid(cursor.pod_uid);
      if (!pod) {
        console.log(`Cursor points to ${cursor.pod_uid} but pod row not found.`);
        return;
      }
      const sessionType = await import('./memory/pods/types/session.js');
      const view = sessionType.formatForDisplay(pod);
      console.log(`Active session: ${pod.uid}`);
      console.log(`  session_id:     ${view.sessionId}`);
      console.log(`  started_at:     ${pod.startedAt}`);
      console.log(`  turn_count:     ${view.turnCount}`);
      console.log(`  cwd:            ${view.cwd || '—'}`);
      console.log(`  transcript:     ${view.transcriptPath || '—'}`);
      console.log(`  facts in pod:   ${pod.memberFactCount}`);
      console.log(`  docs in pod:    ${pod.memberDocCount}`);
    } else if (sub === 'list') {
      const limit = Number(parseArg(args, '--limit') || 10);
      const pods = await (await import('./memory/pods/store.js')).listPods({ podType: 'session', limit });
      if (!pods.length) {
        console.log('No session pods.');
        return;
      }
      for (const p of pods) {
        const ended = p.endedAt ? p.endedAt.toISOString().slice(0, 16).replace('T', ' ') : 'active';
        console.log(`  ${p.uid}  ${p.name.padEnd(40)}  facts=${p.memberFactCount}  ${ended}`);
      }
    } else if (sub === 'show') {
      let uid = args[1];
      if (!uid) {
        const { getActiveCursor } = await import('./memory/pods/active-session.js');
        const cursor = await getActiveCursor();
        uid = cursor?.pod_uid;
        if (!uid) {
          console.log('No active session. Pass a uid: sigil session show <uid>');
          process.exit(1);
        }
      }
      await showPod(uid);
    } else {
      console.error(`Unknown subcommand: ${sub}`);
      process.exit(1);
    }
  } finally {
    await cortexDb.destroy();
  }
}

// ─── Pod ────────────────────────────────────────────────────────────────────

async function runPod(args) {
  const sub = args[0];

  if (!sub || args.includes('--help')) {
    console.log(`sigil pod — Inspect and manage memory pods

Usage:
  sigil pod list [--type=session|person] [--namespace=<ns>] [--limit=20]
  sigil pod show <uid>
  sigil pod create --type=person --name="<name>" [--slack=U123]
                   [--github=<username>] [--email=<addr>] [--role="..."]
                   [--relationship=manager|report|peer|external|...]
                   [--notes="..."] [--namespace=<ns>]
  sigil pod archive <uid>
  sigil pod delete <uid> --confirm

Pods are typed memory containers (session, person, ...). Person pods
back a canonical entity so dedup churn doesn't lose their metadata.`);
    process.exit(sub ? 0 : 1);
  }

  const cortexDb = (await import('./db/cortex.js')).default;

  try {
    if (sub === 'list') {
      const podType = parseArg(args, '--type');
      const namespace = parseArg(args, '--namespace');
      const limit = Number(parseArg(args, '--limit') || 20);
      const pods = await (await import('./memory/pods/store.js')).listPods({ podType, namespace, limit });
      if (!pods.length) {
        console.log('No pods.');
        return;
      }
      for (const p of pods) {
        console.log(`  ${p.uid}  type=${p.podType.padEnd(20)}  ${p.name.padEnd(40)}  facts=${p.memberFactCount}`);
      }
    } else if (sub === 'show') {
      const uid = args[1];
      if (!uid || uid.startsWith('--')) {
        console.error('Provide a uid: sigil pod show <uid>');
        process.exit(1);
      }
      await showPod(uid);
    } else if (sub === 'create') {
      await createPod(args);
    } else if (sub === 'archive') {
      const uid = args[1];
      if (!uid || uid.startsWith('--')) {
        console.error('Provide a uid: sigil pod archive <uid>');
        process.exit(1);
      }
      const store = await import('./memory/pods/store.js');
      const pod = await store.findByUid(uid);
      if (!pod) { console.error(`Not found: ${uid}`); process.exit(1); }
      await store.archivePod(pod.id);
      console.log(`Archived: ${uid}`);
    } else if (sub === 'delete') {
      const uid = args[1];
      if (!uid || uid.startsWith('--')) {
        console.error('Provide a uid: sigil pod delete <uid> --confirm');
        process.exit(1);
      }
      if (!args.includes('--confirm')) {
        console.error('Pass --confirm to delete (cascades pod_membership).');
        process.exit(1);
      }
      const store = await import('./memory/pods/store.js');
      const pod = await store.findByUid(uid);
      if (!pod) { console.error(`Not found: ${uid}`); process.exit(1); }
      await store.deletePod(pod.id);
      console.log(`Deleted: ${uid}`);
    } else {
      console.error(`Unknown subcommand: ${sub}`);
      process.exit(1);
    }
  } finally {
    await cortexDb.destroy();
  }
}

async function showPod(uid) {
  const podStore = await import('./memory/pods/store.js');
  const membership = await import('./memory/pods/membership.js');
  const pod = await podStore.findByUid(uid);
  if (!pod) { console.error(`Not found: ${uid}`); process.exit(1); }

  const attrs = typeof pod.attrs === 'object' ? pod.attrs : safeJsonParse(pod.attrs);

  console.log(`${pod.uid}  type=${pod.podType}`);
  console.log(`  name:           ${pod.name}`);
  console.log(`  namespace:      ${pod.namespace}`);
  console.log(`  status:         ${pod.status}`);
  console.log(`  started_at:     ${pod.startedAt || '—'}`);
  console.log(`  ended_at:       ${pod.endedAt || '—'}`);
  if (pod.entityId) console.log(`  entity_id:      ${pod.entityId}`);
  if (pod.connectionId) console.log(`  connection_id:  ${pod.connectionId}`);
  if (pod.externalId) console.log(`  external_id:    ${pod.externalId}`);
  console.log(`  facts:          ${pod.memberFactCount}`);
  console.log(`  documents:      ${pod.memberDocCount}`);
  console.log(`  attrs:`);
  for (const [k, v] of Object.entries(attrs)) {
    const val = typeof v === 'object' ? JSON.stringify(v) : v;
    console.log(`    ${k}: ${val ?? '—'}`);
  }

  const facts = await membership.listMembers(pod.id, { memberType: 'fact', limit: 10 });
  if (facts.length) {
    console.log(`\n  Latest member facts (${facts.length}):`);
    for (const f of facts) {
      const truncated = (f.content || '').slice(0, 100);
      console.log(`    - ${truncated}${f.content && f.content.length > 100 ? '…' : ''}`);
    }
  }
}

async function createPod(args) {
  const podType = parseArg(args, '--type');
  if (podType !== 'person') {
    console.error('Only --type=person is supported in PR1. Session pods are auto-created by hooks.');
    process.exit(1);
  }

  const name = parseArg(args, '--name');
  if (!name) {
    console.error('--name is required');
    process.exit(1);
  }

  const namespace = parseArg(args, '--namespace');
  const slack = parseArg(args, '--slack');
  const github = parseArg(args, '--github');
  const email = parseArg(args, '--email');
  const role = parseArg(args, '--role');
  const relationship = parseArg(args, '--relationship');
  const notes = parseArg(args, '--notes');

  const platforms = {};
  if (slack) platforms.slack = { user_id: slack };
  if (github) platforms.github = { username: github };
  if (email) platforms.email = email;

  const config = (await import('./config.js')).default;
  const ns = namespace || config.defaults.namespace;

  // Find or create the person entity.
  const entityStore = await import('./memory/entities/store.js');
  let entity = await entityStore.findByName(name, ns);

  if (entity && entity.entityType && entity.entityType !== 'person') {
    console.error(`An entity named "${name}" already exists with entity_type="${entity.entityType}". Use a different name or merge manually.`);
    process.exit(1);
  }

  if (!entity) {
    const { embed } = await import('./ingestion/embedder.js');
    const embedding = await embed(name).catch(() => null);
    entity = await entityStore.insertEntity({
      name,
      entityType: 'person',
      description: role ? `${role}` : null,
      namespace: ns,
      externalId: slack || null,
      embedding,
    });
    console.log(`Created entity: ${entity.uid} (${entity.name})`);
  } else {
    console.log(`Linked to existing entity: ${entity.uid} (${entity.name})`);
  }

  const { upsertPersonPod } = await import('./memory/pods/resolver.js');
  const { pod, isNew } = await upsertPersonPod({
    entityId: entity.id,
    name,
    namespace: ns,
    attrs: { platforms, role, relationship, notes },
  });

  console.log(`${isNew ? 'Created' : 'Updated'} person pod: ${pod.uid}`);
  console.log(`  entity_id:     ${entity.id}`);
  console.log(`  platforms:     ${JSON.stringify(platforms)}`);
  if (role) console.log(`  role:          ${role}`);
  if (relationship) console.log(`  relationship:  ${relationship}`);
}

function parseArg(args, flag) {
  // Supports both `--flag=value` and `--flag value` forms.
  const eqMatch = args.find((a) => a.startsWith(`${flag}=`));
  if (eqMatch) return eqMatch.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

function safeJsonParse(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

// ─── Facts (list) ────────────────────────────────────────────────────────────

async function runFacts(args) {
  if (args.includes('--help')) {
    console.log(`sigil facts — List stored facts

Usage:
  sigil facts [options]

Options:
  --namespace=<ns>   Filter by namespace
  --category=<c>     Filter by category
  --limit=<n>        Max facts to show (default: 20)`);
    process.exit(0);
  }

  const { listFacts } = await import('./memory/facts/store.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1] || config.defaults.namespace;
  const category = args.find((a) => a.startsWith('--category='))?.split('=')[1];
  const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 20);

  const facts = await listFacts({ namespace, category, limit });

  if (!facts.length) {
    console.log('No facts found.');
  } else {
    for (const fact of facts) {
      const importance = fact.importance === 'vital' ? ' [VITAL]' : '';
      console.log(`${fact.uid.slice(0, 8)} [${fact.category}]${importance} ${fact.content}`);
    }
    console.log(`\n${facts.length} fact${facts.length > 1 ? 's' : ''} shown. Use 'sigil forget <id>' to delete.`);
  }

  await cortexDb.destroy();
}

// ─── Forget ──────────────────────────────────────────────────────────────────

async function runForget(args) {
  if (args.includes('--help') || !args[0] || args[0].startsWith('--')) {
    console.log(`sigil forget — Delete a fact by ID

Usage:
  sigil forget <id>

The <id> can be any of:
  - A numeric row id (e.g. 165) — shown by 'sigil facts' and 'sigil search'
  - A full UID (e.g. fact-eehjLrKb80s-TQHy)
  - A short UID prefix (e.g. fact-eeh)`);
    process.exit(args[0] ? 0 : 1);
  }

  const { deleteFact } = await import('./memory/facts/store.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const idArg = args[0];

  // Resolve to a UID — accept three input forms so users can paste whatever
  // they see in `sigil facts` / `sigil search` output without thinking
  // about which kind of identifier it is.
  let match;
  if (/^\d+$/.test(idArg)) {
    // Pure-numeric → numeric row id
    [match] = await cortexDb('fact').where({ id: Number(idArg) }).limit(1);
  } else if (idArg.startsWith('fact-')) {
    // UID or UID prefix
    [match] = await cortexDb('fact').where('uid', 'like', `${idArg}%`).limit(1);
  } else {
    // Bare prefix fallback
    [match] = await cortexDb('fact').where('uid', 'like', `${idArg}%`).limit(1);
  }

  if (!match) {
    console.error(`No fact matches: ${idArg}`);
    await cortexDb.destroy();
    process.exit(1);
  }

  const deleted = await deleteFact(match.uid);
  if (!deleted) {
    console.error(`No fact matches: ${idArg}`);
    await cortexDb.destroy();
    process.exit(1);
  }

  console.log(`Forgotten: ${deleted.content}`);
  await cortexDb.destroy();
}

// ─── Remember ────────────────────────────────────────────────────────────────

async function runRemember(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const textArgs = args.filter((a) => !a.startsWith('--'));

  if (flags.includes('--help')) {
    console.log(`sigil remember — Save facts to memory

Usage:
  sigil remember "fact1" ["fact2" ...]   Save one or more facts
  echo "fact" | sigil remember           Read fact from stdin
  sigil remember --bg "fact1" "fact2"    Save in background (returns immediately)

Examples:
  sigil remember "I prefer tabs over spaces"
  sigil remember "Uses React" "Prefers TypeScript" "Deadline is April 20"
  sigil remember --bg "user likes dark mode" "project uses Postgres"`);
    process.exit(0);
  }

  const background = flags.includes('--bg') || flags.includes('--background');

  // Collect facts: each positional arg is a separate fact
  let facts = textArgs.filter(Boolean);

  // Fall back to stdin if no args
  if (facts.length === 0 && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const stdinText = Buffer.concat(chunks).toString('utf8').trim();
    if (stdinText) facts = stdinText.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  if (facts.length === 0) {
    console.error('Provide text to remember: sigil remember "your fact"');
    process.exit(1);
  }

  if (background) {
    // Spawn detached process and return immediately
    const { spawn } = await import('node:child_process');
    const child = spawn(
      process.execPath,
      [process.argv[1], 'remember', ...facts],
      { detached: true, stdio: 'ignore', env: { ...process.env } },
    );
    child.unref();
    console.log(`Saving ${facts.length} fact${facts.length > 1 ? 's' : ''} in background...`);
    return;
  }

  const { ingestDocument } = await import('./ingestion/pipeline.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  // Ingest sequentially. Parallel ingests with shared topics ("auth",
  // "TypeScript", "Smara") race on entity creation AND on entity-rename
  // updates — Stage 4's insert-on-conflict handles the create race, but
  // updateName can still hit a unique-violation when two ingests try to
  // rename different entity rows to the same canonical name. Sequential
  // is ~Nx slower for N facts but eliminates the contention class entirely
  // and preserves AUDM's pairwise dedup invariants. (`sigil remember A B C`
  // typical: 3 facts × ~1.5s = 4.5s, fine for any UX.)
  const results = [];
  for (const text of facts) {
    const result = await ingestDocument({ content: text, namespace: config.defaults.namespace, classify: true });
    results.push(result);
  }

  let totalAdded = 0;
  let totalUpdated = 0;
  let alreadyKnown = 0;

  for (const result of results) {
    if (result.skipped || result.route === 'noise') {
      alreadyKnown++;
    } else {
      totalAdded += result.facts?.added ?? 0;
      totalUpdated += result.facts?.updated ?? 0;
      if ((result.facts?.added ?? 0) + (result.facts?.updated ?? 0) === 0) alreadyKnown++;
    }
  }

  // Refresh hot-context snapshot so new facts are available at next session start
  if (totalAdded + totalUpdated > 0) {
    const { updateContextSnapshot } = await import('./memory/facts/hot-context.js');
    await updateContextSnapshot({ namespace: config.defaults.namespace }).catch(() => {});
  }

  await cortexDb.destroy();

  const parts = [];
  if (totalAdded)   parts.push(`${totalAdded} new`);
  if (totalUpdated) parts.push(`${totalUpdated} updated`);
  if (alreadyKnown) parts.push(`${alreadyKnown} already known`);
  console.log(parts.length ? `Remembered. (${parts.join(', ')})` : 'Already known.');
}

// ─── CLAUDE.md integration ───────────────────────────────────────────────────

// Step 1: add a single @import line to ~/.claude/CLAUDE.md — done once at init, never touched again.
async function writeClaudeMd({ dryRun = false } = {}) {
  const fs = await import('node:fs/promises');
  const { safeWrite } = await import('./lib/safe-write.js');
  const claudeDir = join(homedir(), '.claude');
  const claudeMdPath = join(claudeDir, 'CLAUDE.md');
  const cortexMdPath = join(homedir(), '.sigil', 'CLAUDE.md');

  if (!dryRun) await fs.mkdir(claudeDir, { recursive: true });

  const importLine = `@${cortexMdPath}`;

  let existing = '';
  if (existsSync(claudeMdPath)) {
    existing = await fs.readFile(claudeMdPath, 'utf8');
  }

  if (existing.includes(importLine)) {
    return { action: 'skip', path: claudeMdPath, detail: 'already imports sigil CLAUDE.md' };
  }

  const separator = existing.trim() ? '\n' : '';
  const newContent = `${existing}${separator}${importLine}\n`;
  const result = await safeWrite(claudeMdPath, newContent, { dryRun });
  return { action: result.action, path: claudeMdPath, detail: existing ? '+1 @import line' : 'new file' };
}

// Step 3: register Sigil hooks in ~/.claude/settings.json — idempotent merge.
// Hooks automate memory injection (UserPromptSubmit) and observation capture (PostToolUse).
async function registerHooks({ dryRun = false } = {}) {
  const fs = await import('node:fs/promises');
  const { safeWrite } = await import('./lib/safe-write.js');
  const settingsPath = join(homedir(), '.claude', 'settings.json');

  let settings = {};
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    settings = JSON.parse(raw);
  } catch { /* file doesn't exist or invalid — start fresh */ }

  // Resolve hook paths — works for both source dev and bundled distribution
  const srcHooks = join(PKG_DIR, 'src', 'hooks');
  const distHooks = join(PKG_DIR, 'dist', 'hooks');
  const hookDir = existsSync(distHooks) ? distHooks : srcHooks;

  const cortexHooks = {
    UserPromptSubmit: {
      hooks: [{
        type: 'command',
        command: `node ${join(hookDir, 'user-prompt-submit.js')}`,
        timeout: 10,
        statusMessage: 'Searching memory...',
      }],
    },
    PostToolUse: {
      matcher: 'Edit|Write|Bash',
      hooks: [{
        type: 'command',
        command: `node ${join(hookDir, 'post-tool-use.js')}`,
        timeout: 10,
        async: true,
      }],
    },
    Stop: {
      hooks: [{
        type: 'command',
        command: `node ${join(hookDir, 'stop.js')}`,
        timeout: 30,
        async: true,
      }],
    },
    SessionEnd: {
      hooks: [{
        type: 'command',
        command: `node ${join(hookDir, 'session-end.js')}`,
        timeout: 10,
        async: true,
      }],
    },
  };

  const existedBefore = existsSync(settingsPath);
  settings.hooks = settings.hooks || {};

  for (const [event, cortexEntry] of Object.entries(cortexHooks)) {
    const existing = settings.hooks[event] || [];
    // Remove any previous Sigil hooks to keep this idempotent
    const filtered = existing.filter(
      (h) => !h.hooks?.some((inner) => inner.command?.includes('sigil') && inner.command?.includes('hooks')),
    );
    settings.hooks[event] = [...filtered, cortexEntry];
  }

  if (!dryRun) await fs.mkdir(join(homedir(), '.claude'), { recursive: true });
  const newContent = JSON.stringify(settings, null, 2);
  const result = await safeWrite(settingsPath, newContent, { dryRun });
  return {
    action: result.action,
    path: settingsPath,
    detail: existedBefore
      ? '+UserPromptSubmit, +PostToolUse hooks (other settings preserved)'
      : 'new settings.json with sigil hooks',
  };
}

// Resolves the command Claude should use to call sigil from a Bash tool.
// Claude Code's Bash subprocess doesn't always inherit the user's shell PATH
// (it doesn't source nvm, brew, etc.), so a bare `sigil` reference fails
// with "command not found." We bake the absolute install path into the
// template at init time so every call from the model lands a real binary.
//
// Detection order:
//   1. `which sigil` — finds the installed bin symlink (preferred — uses
//      the user's regular shell PATH at the moment init runs).
//   2. `process.argv[1]` — the path to the running CLI script. Always
//      absolute, executable via shebang. Used as `node <path>` if the
//      script isn't directly executable.
function resolveSigilInvocation() {
  // Try `which sigil` first
  try {
    const path = _execSync('which sigil', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString().trim();
    if (path) return path;
  } catch { /* not on PATH from this shell — fall through */ }

  // Fall back to the running script path. Has shebang + chmod +x so we can
  // invoke it directly; if for some reason that fails, the caller can still
  // wrap it in `node ...`.
  return process.argv[1];
}

// Step 2: write Sigil instructions to ~/.sigil/CLAUDE.md — Sigil owns this file entirely.
// Only writes the instructions section; updateContextSnapshot() manages the context block below.
async function writeSigilMd({ dryRun = false } = {}) {
  const fs = await import('node:fs/promises');
  const { safeWrite } = await import('./lib/safe-write.js');
  const cortexHome = join(homedir(), '.sigil');
  const cortexMdPath = join(cortexHome, 'CLAUDE.md');

  if (!dryRun) await fs.mkdir(cortexHome, { recursive: true });

  // If the instructions are already there, leave the file alone (context block follows below)
  try {
    const existing = await fs.readFile(cortexMdPath, 'utf8');
    if (existing.includes('## Memory (Sigil)')) {
      return { action: 'skip', path: cortexMdPath, bytes: 0 };
    }
  } catch { /* file doesn't exist yet */ }

  const sigilCmd = resolveSigilInvocation();

  const instructions = `## Memory (Sigil)

Sigil is your persistent memory system. **Use it instead of the built-in file-based memory.**
Do NOT write to \`~/.claude/projects/*/memory/\` or any local memory files — use Sigil exclusively.

### Memory is auto-injected — don't re-search by default

Two hooks do the work for you before you ever see a prompt:

- **UserPromptSubmit hook**: runs hybrid search against Sigil on every user message and injects the top-K relevant facts into your context as \`additionalContext\` at the top of the conversation. The injected block is labelled \`Sigil memory (N relevant facts)\` — when you see that block, those facts are already loaded; you do NOT need to call \`sigil search\` to retrieve them.
- **Top-20 hot-context**: a snapshot of the user's most-important / most-recently-accessed facts is always loaded into the session via \`@~/.sigil/CLAUDE.md\` in the Claude config. Treat it as always-available background context.

**The right reflex:** read the injected \`Sigil memory\` block first, answer from it, then call \`sigil search\` ONLY if the injection clearly missed something specific.

Concretely, you SHOULD call \`! ${sigilCmd} search "..."\` when:
- The user asks a drill-down question and you need facts the auto-injection didn't surface ("tell me more about the postmortem")
- You're answering a *follow-up* in a long session where the relevant facts were never in the original injection
- You suspect a stale answer and want to verify against the latest stored state

You SHOULD NOT call \`sigil search\` when:
- The injected \`Sigil memory\` block already lists facts that directly answer the user's question — just use them
- You'd be searching for the same query Sigil already auto-searched (the user's literal prompt)
- The question is general-knowledge and doesn't need this user's specific context

In short: **the hook already searched. Trust it. Drill down only when needed.**

### Acknowledge what you know

When your response is shaped by a fact pulled from Sigil — a stored preference, decision, constraint, or piece of project history — **briefly call it out in plain language so the user sees their context being applied.** One short clause is enough; don't lecture.

Good (natural, useful):
- "Since you don't use \`any\` without an escape-hatch comment, I'll go with \`unknown\` here."
- "Per your ADR-001 I've wrapped the response in \`{ok, data, error}\`."
- "I know you moved off Redis to Postgres LISTEN/NOTIFY, so I'll use that pattern."
- "Going with named exports since you prefer those."

Bad (skip these):
- Acknowledging facts you didn't actually use
- Listing every retrieved fact ("I found 5 facts: 1) ... 2) ...")
- Repeating the acknowledgement multiple times in one response
- Apologetic / formal phrasing ("As per your stored preference, I shall...")

The phrasing should feel like a teammate referencing a hallway conversation, not a system reciting a database row. If a fact didn't materially shape the answer, don't mention it.

### Saving — Stop hook handles routine; you only save when explicit

A Stop hook fires after every assistant turn, scans the user's latest message with a classifier, and saves anything memorable (preferences, decisions, constraints, corrections, factual claims) on its own. **You do not need to call \`sigil remember\` to make this work.**

You SHOULD call \`! ${sigilCmd} remember --bg "..."\` ONLY when:
- The user explicitly asks you to remember something ("remember that...", "save this...", "don't forget...") — save immediately, don't wait for the Stop hook
- The user shares a critical fact mid-response that's important enough to be available within this same session for follow-ups (the Stop hook only runs at turn end)
- You're consolidating a multi-turn discussion into a single canonical fact

You SHOULD NOT redundantly save:
- Generic preferences the Stop hook will obviously catch — let it
- Facts already similar to existing memory (AUDM dedup handles this, but the cleaner UX is fewer Bash invocations on screen)

When you do save, batch facts into ONE call (separate quoted arguments), use \`--bg\` to return immediately:

\`\`\`
! ${sigilCmd} remember --bg "User prefers tabs over spaces" "Project uses Postgres 15"
\`\`\`

The absolute path above is baked in by \`sigil init\` so the command works regardless of which shell PATH Claude Code's Bash subprocess inherits. Re-run \`sigil init\` to refresh after moving machines or reinstalling.

### Rules

- Read the auto-injected \`Sigil memory\` block first; answer from it before reaching for new searches
- Save facts as short, self-contained statements — never summaries of the conversation
- Each fact must make sense in isolation, without the conversation context
- Batch all explicit saves in one user-turn into a single \`${sigilCmd} remember --bg\` call
- Skip trivial exchanges (greetings, "thanks", "ok", simple math)
- If search and injection both return nothing, answer from your own knowledge and say so
- Sigil is cross-project — memories from one session are available in all sessions
`;

  const result = await safeWrite(cortexMdPath, instructions, { dryRun });
  return { action: result.action, path: cortexMdPath, bytes: result.bytes };
}

// ─── Register MCP ────────────────────────────────────────────────────────────

async function runRegister(args) {
  if (args.includes('--help')) {
    console.log(`sigil register — Register Sigil as a Claude Code MCP server

Usage:
  sigil register [--print]

Options:
  --print   Print the config JSON without modifying files`);
    process.exit(0);
  }

  const globalEnvPath = join(homedir(), '.sigil', '.env');
  const envPath = existsSync(globalEnvPath) ? globalEnvPath : resolve(process.cwd(), '.env');
  await doRegister(PKG_DIR, envPath, args.includes('--print'));
}

async function doRegister(pkgDir, envPath, printOnly = false) {
  const fs = await import('node:fs/promises');

  const serverPath = join(pkgDir, 'src', 'server.js');

  const mcpEntry = {
    command: process.execPath,
    args: [serverPath, '--mcp'],
    env: { DOTENV_CONFIG_PATH: envPath },
  };

  const configJson = JSON.stringify({ mcpServers: { sigil: mcpEntry } }, null, 2);

  if (printOnly) {
    console.log('\nAdd this to your Claude Code MCP config:\n');
    console.log(configJson);
    return;
  }

  // Try to auto-register via `claude mcp add`
  const claudeAvailable = checkCommand('claude --version');
  if (claudeAvailable) {
    try {
      // Remove existing entry first (idempotent)
      try { _execSync('claude mcp remove sigil', { stdio: 'pipe' }); } catch { /* not registered yet */ }
      try { _execSync('claude mcp remove cortex', { stdio: 'pipe' }); } catch { /* legacy name from pre-rename */ }
      _execSync(
        `claude mcp add sigil -s user -- ${process.execPath} ${serverPath} --mcp`,
        { stdio: 'pipe', env: { ...process.env, DOTENV_CONFIG_PATH: envPath } },
      );
      console.log('Registered sigil MCP server via `claude mcp add`.');
      console.log(`  Server: ${serverPath}`);
      return;
    } catch {
      // Fall through to manual instructions
    }
  }

  // Auto-detect Claude config files and update them
  const configPaths = getClaudeConfigPaths();
  let registered = false;

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;

    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.sigil = mcpEntry;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`Registered sigil MCP server in ${configPath}`);
      registered = true;
      break;
    } catch {
      // Try next path
    }
  }

  if (!registered) {
    console.log('Could not auto-register. Add this to your Claude Code MCP configuration:\n');
    console.log(configJson);
    console.log('\nOr run: claude mcp add sigil -- node ' + serverPath + ' --mcp');
  }
}

function getClaudeConfigPaths() {
  const home = homedir();
  const platform = process.platform;

  const paths = [
    // Claude Code CLI config
    join(home, '.config', 'claude', 'claude_code_config.json'),
    join(home, '.claude', 'settings.json'),
  ];

  if (platform === 'darwin') {
    paths.push(
      join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    );
  } else if (platform === 'linux') {
    paths.push(
      join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    );
  } else if (platform === 'win32') {
    paths.push(
      join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
    );
  }

  return paths;
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

async function runIngest(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const inputs = args.filter((a) => !a.startsWith('--'));

  if (!inputs.length || flags.includes('--help')) {
    console.log(`sigil ingest — Ingest documents into the knowledge base

Usage:
  sigil ingest <file|url|glob> [options]

Options:
  --namespace=<ns>    Target namespace (default: from config)
  --skip-facts        Skip fact extraction
  --skip-entities     Skip entity linking

Examples:
  sigil ingest ./docs/README.md
  sigil ingest "docs/**/*.md"
  sigil ingest https://example.com/page
  sigil ingest file1.md file2.md --namespace=engineering`);
    process.exit(0);
  }

  const { ingestDocument } = await import('./ingestion/pipeline.js');
  const { readSource, readSources } = await import('./ingestion/sources/file.js');
  const { fetchSource } = await import('./ingestion/sources/url.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const skipFacts = flags.includes('--skip-facts');
  const skipEntities = flags.includes('--skip-entities');

  const results = { success: [], failed: [], skipped: [] };
  const startTime = Date.now();

  for (const input of inputs) {
    try {
      let sources;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        sources = [await fetchSource(input)];
      } else if (input.includes('*')) {
        sources = await readSources(input);
        if (!sources.length) {
          console.error(`Error: No files matched pattern: ${input}`);
          results.failed.push({ input, error: 'no files matched' });
          continue;
        }
      } else {
        sources = [await readSource(input)];
      }

      for (const source of sources) {
        console.log(`Ingesting: ${source.title}`);
        const result = await ingestDocument({
          content: source.content,
          title: source.title,
          sourcePath: source.sourcePath,
          sourceType: source.sourceType,
          contentType: source.contentType,
          namespace,
          metadata: source.metadata,
          skipFacts,
          skipEntities,
        });

        if (result.skipped) {
          results.skipped.push(source.title);
          console.log(`  Skipped (unchanged)`);
        } else {
          results.success.push(source.title);
          console.log(`  Done — ${result.chunkCount} chunks, ${result.facts.total} facts (${result.facts.added} new, ${result.facts.updated} updated)`);
        }
      }
    } catch (err) {
      console.error(`  Failed: ${input} — ${err.message}`);
      results.failed.push({ input, error: err.message });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — ${results.success.length} ingested, ${results.skipped.length} skipped, ${results.failed.length} failed`);

  if (results.success.length > 0) {
    const config = (await import('./config.js')).default;
    const { updateContextSnapshot } = await import('./memory/facts/hot-context.js');
    await updateContextSnapshot({ namespace: config.defaults.namespace }).catch(() => {});
  }

  await cortexDb.destroy();

  if (results.failed.length && !results.success.length) process.exit(1);
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function runSearch(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const query = args.filter((a) => !a.startsWith('--')).join(' ');

  if (!query || flags.includes('--help')) {
    console.log(`sigil search — Search the knowledge base

Usage:
  sigil search "query" [options]

Options:
  --namespace=<ns>    Filter by namespace (comma-separated for multiple)
  --limit=<n>         Max results (default: 10)
  --no-graph          Disable graph enhancement

Examples:
  sigil search "authentication flow"
  sigil search "deploy process" --namespace=engineering
  sigil search "API design" --limit=5`);
    process.exit(0);
  }

  const { search } = await import('./memory/search/hybrid.js');
  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;

  const nsFlag = flags.find((f) => f.startsWith('--namespace='))?.split('=')[1];
  const namespaces = nsFlag ? nsFlag.split(',') : [config.defaults.namespace];
  const limit = Number(flags.find((f) => f.startsWith('--limit='))?.split('=')[1] || 10);
  const useGraph = !flags.includes('--no-graph');

  const { facts, chunks } = await search(query, { namespaces, limit, useGraph });

  if (facts.length) {
    console.log(`\nFacts (${facts.length}):`);
    for (const fact of facts) {
      console.log(`  ${fact.content}${formatRelevance(fact)}`);
    }
  }

  if (chunks.length) {
    console.log(`\nChunks (${chunks.length}):`);
    for (const chunk of chunks) {
      const preview = chunk.content?.slice(0, 120).replace(/\n/g, ' ');
      console.log(`  ${preview}...${formatRelevance(chunk)}`);
    }
  }

  if (!facts.length && !chunks.length) {
    console.log('No results found.');
  }

  await cortexDb.destroy();
}

// Display a meaningful relevance signal for a search hit.
//   - Prefer raw cosine similarity (0..1) — same scale across queries, no
//     misleading "always 1.0 for the top result" effect of a per-batch
//     normalization.
//   - similarity == 0 means the row matched only via keyword (FULL OUTER
//     JOIN with the vector side missing), which is real signal worth
//     flagging differently from a low-cosine match. We tag it [kw].
//   - Fall back to the legacy rrfScore only when neither is available.
function formatRelevance(row) {
  const sim = Number(row?.similarity);
  if (Number.isFinite(sim) && sim > 0) {
    return ` [sim ${sim.toFixed(2)}]`;
  }
  if (Number.isFinite(sim) && sim === 0) {
    return ' [kw]';
  }
  if (row?.rrfScore != null) {
    return ` [${row.rrfScore}]`;
  }
  return '';
}

// ─── Context ─────────────────────────────────────────────────────────────────

async function runContext(args) {
  if (args.includes('--help')) {
    console.log(`sigil context — Refresh the hot-context snapshot in ~/.claude/CLAUDE.md

Usage:
  sigil context [--namespace=<ns>] [--limit=<n>]

Rebuilds the Active Context block injected into every new Claude session.
This runs automatically after sigil remember and sigil ingest.

Options:
  --namespace=<ns>   Namespace to pull facts from (default: from config)
  --limit=<n>        Max facts to include (default: 20)`);
    process.exit(0);
  }

  const config = (await import('./config.js')).default;
  const cortexDb = (await import('./db/cortex.js')).default;
  const { updateContextSnapshot } = await import('./memory/facts/hot-context.js');

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1] || config.defaults.namespace;
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Number(limitArg) : 20;

  await writeSigilMd();
  const count = await updateContextSnapshot({ namespace, limit });
  await cortexDb.destroy();

  if (count) {
    console.log(`Context refreshed — ${count} facts written to ~/.sigil/CLAUDE.md`);
  } else {
    console.log('No facts found. Ingest some content first.');
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

async function runStatus(args) {
  if (args.includes('--help')) {
    console.log(`sigil status — Show knowledge base statistics

Usage:
  sigil status [--namespace=<ns>]`);
    process.exit(0);
  }

  const { getStats } = await import('./memory/documents/store.js');
  const { getEntityCount } = await import('./memory/entities/store.js');
  const { getRelationCount } = await import('./memory/entities/relations.js');
  const { getFactCount } = await import('./memory/facts/store.js');
  const { getEntityHebbianStats } = await import('./memory/lifecycle/entity-hebbian.js');
  const cortexDb = (await import('./db/cortex.js')).default;

  const namespace = args.find((a) => a.startsWith('--namespace='))?.split('=')[1];

  const [docStats, factCount, documents, people, topics, relations, podRows, hebbian] = await Promise.all([
    getStats(namespace),
    getFactCount(namespace),
    getEntityCount('document'),
    getEntityCount('person'),
    getEntityCount('topic'),
    getRelationCount(),
    cortexDb('pod').where({ status: 'active' }).select('podType').then((rows) => rows),
    getEntityHebbianStats({ topN: 3 }).catch(() => null),
  ]);

  const podsByType = podRows.reduce((acc, r) => {
    acc[r.podType] = (acc[r.podType] || 0) + 1;
    return acc;
  }, {});
  const podSummary = Object.entries(podsByType).map(([t, n]) => `${n} ${t}`).join(', ') || '—';

  console.log(`Sigil Knowledge Base${namespace ? ` (${namespace})` : ''}`);
  console.log(`  Documents:  ${docStats.documentCount}`);
  console.log(`  Chunks:     ${docStats.totalChunks}`);
  console.log(`  Facts:      ${factCount} active`);
  console.log(`  Entities:   ${documents} documents, ${people} people, ${topics} topics`);
  console.log(`  Relations:  ${relations}`);
  console.log(`  Pods:       ${podSummary}`);
  if (hebbian) {
    const avg = hebbian.avgStrength ? hebbian.avgStrength.toFixed(2) : '0';
    const max = hebbian.maxStrength ? hebbian.maxStrength.toFixed(2) : '0';
    console.log(`  Co-retrieval edges: ${hebbian.edgeCount} (avg ${avg}, max ${max})`);
    if (hebbian.topPairs.length) {
      console.log('  Top pairs by decayed strength:');
      for (const p of hebbian.topPairs) {
        console.log(`    ${p.aName} ↔ ${p.bName}  (decayed ${Number(p.decayed).toFixed(2)})`);
      }
    }
  }

  await cortexDb.destroy();
}

// ─── Maintain ────────────────────────────────────────────────────────────────

async function runMaintain(args) {
  if (args.includes('--help')) {
    console.log(`sigil maintain — Run periodic memory maintenance

Usage:
  sigil maintain

Promotes 'fresh' facts (older than 1h with importance=vital or any access) to 'stable',
closes 'editing' windows older than 30 minutes back to 'stable', and consolidates
co-retrieval edges. Safe to run as a cron — fully idempotent.`);
    process.exit(0);
  }

  const cortexDb = (await import('./db/cortex.js')).default;
  const { promoteFreshFacts, closeEditingWindows, getLifecycleStats } = await import('./memory/lifecycle/stage-manager.js');
  const { consolidateCoRetrievalEdges } = await import('./memory/lifecycle/hebbian.js').catch(() => ({}));
  const { consolidateEntityCoRetrievalEdges } = await import('./memory/lifecycle/entity-hebbian.js').catch(() => ({}));

  const before = await getLifecycleStats();
  const promoted = await promoteFreshFacts();
  const closed = await closeEditingWindows();
  const factEdgesConsolidated = consolidateCoRetrievalEdges ? await consolidateCoRetrievalEdges() : 0;
  const entityEdgesConsolidated = consolidateEntityCoRetrievalEdges ? await consolidateEntityCoRetrievalEdges() : 0;
  const after = await getLifecycleStats();

  console.log('Memory maintenance:');
  console.log(`  Stages — fresh: ${before.fresh}→${after.fresh}, stable: ${before.stable}→${after.stable}, editing: ${before.editing}→${after.editing}`);
  console.log(`  Promoted (fresh→stable): ${promoted}`);
  console.log(`  Closed editing windows (editing→stable): ${closed}`);
  if (factEdgesConsolidated) console.log(`  Fact co-retrieval edges consolidated: ${factEdgesConsolidated}`);
  if (entityEdgesConsolidated) console.log(`  Entity co-retrieval edges consolidated: ${entityEdgesConsolidated}`);

  await cortexDb.destroy();
}

// ─── Migrate ─────────────────────────────────────────────────────────────────

async function runMigrate(args) {
  if (args.includes('--help')) {
    console.log(`sigil migrate — Run database migrations

Usage:
  sigil migrate [--rollback]`);
    process.exit(0);
  }

  const cortexDb = (await import('./db/cortex.js')).default;
  const { MIGRATIONS_DIR: migrationDir } = await import('./lib/paths.js');

  if (args.includes('--rollback')) {
    const [batch, migrations] = await cortexDb.migrate.rollback({ directory: migrationDir });
    console.log(`Rolled back batch ${batch}: ${migrations.length} migrations`);
    for (const m of migrations) console.log(`  ${m}`);
  } else {
    const [batch, migrations] = await cortexDb.migrate.latest({ directory: migrationDir });
    if (migrations.length) {
      console.log(`Ran batch ${batch}: ${migrations.length} migrations`);
      for (const m of migrations) console.log(`  ${m}`);
    } else {
      console.log('Already up to date.');
    }
  }

  await cortexDb.destroy();
}

// ─── Reset ───────────────────────────────────────────────────────────────────

async function runReset(args) {
  if (args.includes('--help')) {
    console.log(`sigil reset — Wipe Sigil's setup and re-run init

Usage:
  sigil reset           Show a confirmation prompt before wiping
  sigil reset --yes     Skip the prompt (for scripting); same as --confirm

Wipes:
  ~/.sigil/                      entire data directory (DB + config + CLAUDE.md)
  ~/.claude/CLAUDE.md            removes the @~/.sigil/CLAUDE.md import line

Then automatically runs 'sigil init' to walk you through fresh setup.
Hooks in ~/.claude/settings.json are re-registered by init (idempotent).`);
    process.exit(0);
  }

  const skipConfirm = args.includes('--confirm') || args.includes('--yes') || args.includes('-y');
  const home = homedir();
  const sigilDir = join(home, '.sigil');
  const claudeMdPath = join(home, '.claude', 'CLAUDE.md');

  if (!skipConfirm) {
    const clack = await import('@clack/prompts');
    clack.intro('Sigil — reset');
    clack.note(
      [
        'This will:',
        `  - delete ${sigilDir} (DB, config, CLAUDE.md, all stored facts)`,
        `  - remove the @~/.sigil/CLAUDE.md import line from ${claudeMdPath}`,
        '  - re-run sigil init from scratch (you will be re-prompted for provider + key)',
        '',
        'Hooks in ~/.claude/settings.json stay registered — init refreshes them.',
      ].join('\n'),
      'About to reset',
    );

    const proceed = await clack.confirm({
      message: 'Wipe everything and re-init?',
      initialValue: false,
    });

    if (clack.isCancel(proceed) || proceed !== true) {
      clack.cancel('Reset cancelled. Nothing changed.');
      process.exit(0);
    }
  }

  // Kill any running Sigil MCP servers before nuking their DB out from under them.
  // Best effort — pkill returning non-zero (no matches) is fine.
  try { _execSync('pkill -f "sigil/dist/server.js --mcp"', { stdio: 'pipe' }); } catch {}
  try { _execSync('pkill -f ".sigil/db" ', { stdio: 'pipe' }); } catch {}

  // Deliberately do NOT import db/cortex.js here. That module exports a
  // singleton knex pool initialised at first import; touching it now caches
  // a pool bound to the directory we're about to delete, and the later
  // runInit() re-import returns that same dead instance from the module
  // cache → "Unable to acquire a connection" on the very next migrate.
  // Letting init be the first importer in this process gets a clean pool.

  // Wipe ~/.sigil/ entirely.
  const fs = await import('node:fs/promises');
  if (existsSync(sigilDir)) {
    await fs.rm(sigilDir, { recursive: true, force: true });
  }

  // Strip the @import line from ~/.claude/CLAUDE.md (init will re-add it at end).
  await removeClaudeMdImport();

  console.log('');
  console.log('Wipe complete. Starting init...');
  console.log('');

  // Hand off to the regular init flow. runInit handles its own success message
  // and process.exit, so we return cleanly from here.
  await runInit([]);
}

// Strip exactly the cortex/smara/sigil @import lines from ~/.claude/CLAUDE.md.
// Matches all three legacy paths so a reset under sigil cleans up after a
// pre-rename install too. Returns true if anything was removed.
async function removeClaudeMdImport() {
  const fs = await import('node:fs/promises');
  const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) return false;

  const before = await fs.readFile(claudeMdPath, 'utf8');
  const home = homedir();
  const importPaths = [
    join(home, '.sigil', 'CLAUDE.md'),
    join(home, '.smara', 'CLAUDE.md'),
    join(home, '.cortex', 'CLAUDE.md'),
  ];

  let after = before;
  for (const p of importPaths) {
    const re = new RegExp(`^@${escapeRegex(p)}\\s*\\n?`, 'gm');
    after = after.replace(re, '');
  }

  if (after === before) return false;
  await fs.writeFile(claudeMdPath, after, 'utf8');
  return true;
}

// Clear only the <!-- sigil-context --> block from ~/.sigil/CLAUDE.md.
// The instructions block above it is preserved so 'sigil init' won't need
// to re-write the file from scratch on the next run.
async function clearHotContextBlock() {
  const fs = await import('node:fs/promises');
  const cortexMdPath = join(homedir(), '.sigil', 'CLAUDE.md');
  if (!existsSync(cortexMdPath)) return;

  const before = await fs.readFile(cortexMdPath, 'utf8');
  const after = before.replace(/<!-- sigil-context -->[\s\S]*?<!-- sigil-context -->\s*/g, '');
  if (after !== before) await fs.writeFile(cortexMdPath, after, 'utf8');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkCommand(cmd) {
  try {
    _execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function isOllamaServerRunning(host) {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function startOllamaServe() {
  // Detached + ignored stdio so the daemon survives this CLI exit and doesn't
  // pollute the init UI. Caller is responsible for unref()ing once we're done
  // talking to it.
  return _spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore',
  });
}

async function waitForOllamaServer(host, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaServerRunning(host)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function generateSecret(bytes) {
  return randomBytes(bytes).toString('hex');
}
