# CLI Surface Audit: Onboarding + Command Cleanliness

**File:** `src/cli.js` (2,423 lines)  
**Date:** 2026-05-19

## Executive Summary

The CLI is **well-structured and minimal**, but suffers from:
1. **Three giant monoliths** (`runInit` 399 lines, `runDoctor` 183 lines) that should be broken into focused sub-handlers
2. **Manual subcommand dispatch** via if-else chains that should be a real registry
3. **Scattered hardcoded paths** (`~/.sigil`, `~/.claude`) that belong in `lib/paths.js`
4. **Async imports throughout** — all top-level deps already imported, yet functions re-import at runtime
5. **~185 comment lines** that mostly narrate code (the config loader comments, function step markers) instead of explaining WHY

**Pluggability gap:** Adding a new pod kind or subcommand requires editing this file directly. No extension points.

---

## Command-by-Command Analysis

| Command | Size | Issue | Severity |
|---------|------|-------|----------|
| `init` | 399 ln | Monolithic; mixes prompts, validation, env loading, DB setup, file writes | High |
| `doctor` | 183 ln | All checks inline; new checks require editing function | High |
| `namespace` | 50 ln | if-else dispatch for `list`/`delete` | Medium |
| `session` | 69 ln | if-else dispatch for `current`/`list`/`show` | Medium |
| `pod` | 79 ln | if-else dispatch for `list`/`show`/`create`/`archive`/`delete` | Medium |
| `register` | 16 ln | Delegates to `doRegister()` — good pattern | Low |
| Others | ≤96 ln | Acceptable size; minor issues | Low |

---

### runInit — 399 lines (134–532)

**What it does:** Interactive setup wizard for DB, LLM/embedding providers, env vars, hooks, and Claude integration.

**Cleanliness issues:**

- **Lines 173–182:** Comment "Load existing config" + 10 lines of manual `.env` parsing. Should extract to `loadEnvFile()` helper.
- **Lines 184–306:** Provider selection logic is 122 lines of cascading `if-else` on provider. OpenRouter path (275–299) is deep nesting (`if ... if wantsAdvanced`). Extract to `selectLLMProvider()` and `selectEmbeddingProvider()` functions.
- **Lines 335–407:** Ollama health-check is 72 lines of state management. Extract to `ensureOllamaReady()`.
- **Lines 419–450:** Config write is 32 lines. Extract to `writeEnvFile()`.
- **Lines 452–490:** File write + DB migrate + hooks all crammed together. Should split into three phases with clear ownership.

**Coupling problems:**

- **Lines 163, 358, 443, 513, 515, 516:** Hardcoded paths like `join(homedir(), '.sigil')` scattered everywhere. Should be imported from `lib/paths.js` and re-exported there.
- **Lines 15000, 15000:** Magic timeout values (15000ms for Ollama health check, 250ms poll interval). No named constants.

**Dead code / unused branches:**

- **Line 210:** Fallback to `CORTEX_SYNTH_MODEL` for synthesis model. Was this a legacy rename? Check if `CORTEX_*` vars are still referenced anywhere.

**Concrete suggestions:**

1. Extract `loadEnvFile(path)` → returns object of parsed key=value pairs (src/cli.js:173–182).
2. Extract `selectLLMProvider(existing)` → returns provider string (src/cli.js:184–306).
3. Extract `ensureOllamaReady(host, dryRun)` → returns boolean (src/cli.js:335–407). Define `OLLAMA_HEALTH_CHECK_TIMEOUT = 15000` and `OLLAMA_POLL_INTERVAL = 250` as module-level constants.
4. Create `src/lib/paths.js` exports: `SIGIL_HOME`, `SIGIL_ENV_PATH`, `SIGIL_DB_PATH`, `CLAUDE_SETTINGS_PATH`, `CLAUDE_MD_PATH` (currently scattered at lines 163, 358, 443, 513, 639, 661, etc.).
5. Move `.env` write logic to `src/lib/env-writer.js` — encapsulate the template generation (lines 424–450).

---

### runDoctor — 183 lines (536–718)

**What it does:** Diagnose DB, LLM, embeddings, hooks, and lock state. Flag errors and suggest fixes.

**Cleanliness issues:**

- **Lines 575–720:** All checks are inline if-else statements. Adding a new check (e.g., "verify Postgres version") requires editing this function.
- **Lines 614–631:** Repeated pattern: import module, call function, log result. Three times, similar structure.
- **Lines 675–714:** Error surfacing and hook error list are 40 lines mixed with check logic. Should extract to `renderHookErrors()` and `checkHookHealth()`.

**Pluggability gap:**

Doctor should have a registry of checks:

```js
const checks = [
  { name: 'Database', run: checkDatabase, severity: 'error' },
  { name: 'LLM provider', run: checkLLM, severity: 'error' },
  // ... add new checks without editing runDoctor
];
```

**Coupling problems:**

- **Lines 595, 661, 724:** More hardcoded paths. Move to `lib/paths.js`.
- **Line 812:** `limit: 10000` magic number for fact count. No named constant.

**Concrete suggestions:**

1. Create `src/lib/doctor-checks.js` with registry of check functions:
   ```js
   export const DOCTOR_CHECKS = [
     { name: 'Database', run: checkDatabase },
     { name: 'LLM provider', run: checkLLM },
     // ...
   ];
   ```
   Then `runDoctor()` iterates over the registry (eliminates the need to edit cli.js for new checks).

2. Extract `checkHookErrors()` → logs recent errors (src/cli.js:675–714).

3. Replace magic `10000` at line 812 with `FACT_SAMPLE_LIMIT = 10000` (module constant).

---

### runNamespace, runSession, runPod — 50–79 lines each

**What they do:** List/manage namespaces, sessions, and memory pods via subcommands.

**Cleanliness issues:**

- **runNamespace (891–920):** `if (sub === 'list')` ... `else if (sub === 'delete')` ... `else`. Two operations.
- **runSession (943–991):** Same pattern: `if (sub === 'current')` ... `else if (sub === 'list')` ... `else if (sub === 'show')`.
- **runPod (1023–1073):** Five subcommands (`list`, `show`, `create`, `archive`, `delete`) all as if-else chain.

All three should use a subcommand dispatch map instead of if-else.

**Coupling problems:**

- **Line 1050 (pod archive), 1065 (pod delete):** `await import('./memory/pods/store.js')` inside each branch. Imports are slow; should be at the top of the function.
- **Lines 1024–1026 (pod list):** Duplicate `parseArg()` calls. No utility to bundle flag parsing.

**Concrete suggestions:**

1. Create dispatch maps for each command:

```js
async function runNamespace(args) {
  const subcommands = {
    list: handleNamespaceList,
    delete: handleNamespaceDelete,
  };
  // ... validate + dispatch
}
```

2. Move all imports to the top of each run* function; avoid import inside if-else.

3. Extract `parseFlags(args)` utility to parse `--foo=bar` and `--foo bar` forms in one place.

---

### runIngest, runSearch, runContext — 76–93 lines each

**What they do:** Bulk ingest documents, search facts, refresh hot-context snapshot.

**Cleanliness issues:**

- **runIngest (1772–1815):** Input path handling (file vs URL vs glob) is correct but could be clearer. Mixed sync/async logic.
- **runSearch (1834–1909):** Similar pattern: parse flags, query, render results inline.

**No critical issues.** These are well-scoped.

---

## Import Hygiene

**Top 5 worst offenders** (await import inside functions):

| Function | Count | Lines | Issue |
|----------|-------|-------|-------|
| `runInit` | 4 | 158, 159, 160, 460, 461, 487 | Lazy-load TUI/FS; needed for dry-run short-circuit. Acceptable. |
| `runDoctor` | 6 | 576, 592, 593, 597, 598, 614, 615, 630, 631, 642, 675, 708, 714 | Could be module-level imports; no dry-run logic to justify laziness. |
| `runPod` | 3 | 1050, 1065, 1080, 1081 | Imported per subcommand. Move to top of function. |
| `runNamespace` | 2 | 888, 889 | Imported once at top of function; acceptable. |
| `runSession` | 4 | 940, 944, 950, 955, 967, 979, 1080, 1081 | Scattered across subcommands. Consolidate. |

**Top 5 files with 10+ imports that could be grouped:**

All imports are already at the top of `src/cli.js` (lines 1–9):
```js
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { execSync as _execSync, spawn as _spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';
```

These could be grouped by role:
- **Path utilities:** `resolve`, `dirname`, `join`, `fileURLToPath`
- **System utilities:** `homedir`, `existsSync`, `execSync`, `spawn`

Minor: Lines 3–7 could become:
```js
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, execSync as _execSync, spawn as _spawn } from 'node:os'; // NO — os doesn't export exec*
```

**No refactoring needed here.** The imports are clean and minimal.

---

## Comment Audit

**185 comment lines found.** Breakdown:

| Category | Count | Action |
|----------|-------|--------|
| Section dividers (`// ─── Init ────...`) | 20 | Keep — visual landmarks |
| Step markers (`// ── Load existing config ──`) | ~40 | **Delete.** They narrate the code flow; readers can follow the code. |
| Explanatory WHY comments | ~50 | Keep — these explain non-obvious choices (env precedence at line 14–17, Ollama health check states at 335–344, hook registration idempotence at 1420) |
| Trailing inline comments | ~75 | Review — many say WHAT not WHY (e.g., "Filter out cancelled" at 1479) |

**Examples of comments to delete:**

- **Line 173:** `// ── Load existing config ─────────────────────────────────────────────────`  
  Delete. The code speaks for itself: `if (existsSync(envPath))` ... `readFile`.

- **Line 199:** `// ── API key ───────────────────────────────────────────────────────────────`  
  Delete. The section is obvious from the code.

- **Line 419:** `// ── Write config ──────────────────────────────────────────────────────────`  
  Delete. Same.

- **Line 1478–1480:** `// Remove any previous Sigil hooks to keep this idempotent`  
  Keep. This explains a non-obvious design choice.

**Concrete suggestion:** Delete all 40 step-marker comments. They don't add value.

---

## Pluggability & Extensibility

### Current gaps:

1. **Commands are hardcoded** (lines 69–84):
   ```js
   const commands = {
     init: runInit,
     doctor: runDoctor,
     // ... 18 more
   };
   ```
   Adding a new top-level command requires editing this object. Should be a registry file.

2. **Subcommands use if-else dispatch.** No dispatch map for `pod`, `session`, `namespace`, etc.

3. **Pod kinds are hard-coded** in multiple places. A new kind (e.g., `team`, `playbook`) requires finding all references.

### Recommendations:

1. Create `src/lib/command-registry.js`:
   ```js
   export const COMMANDS = {
     init: () => import('./commands/init.js'),
     doctor: () => import('./commands/doctor.js'),
     // ... lazy-load per command
   };
   ```

2. For subcommands, use dispatch maps:
   ```js
   async function runPod(args) {
     const subcommands = {
       list: handlePodList,
       show: handlePodShow,
       create: handlePodCreate,
       archive: handlePodArchive,
       delete: handlePodDelete,
     };
     const sub = args[0];
     const handler = subcommands[sub];
     if (!handler) throw new Error(`Unknown subcommand: ${sub}`);
     await handler(args.slice(1));
   }
   ```

3. Create `src/lib/pod-kinds.js` to register kinds:
   ```js
   export const POD_KINDS = {
     claude_session: require('./memory/pods/kinds/claude_session.js'),
     person: require('./memory/pods/kinds/person.js'),
     // ... add new kinds without touching cli.js
   };
   ```

---

## `src/lib/paths.js` — Consolidated Paths

Current state: 35 lines, well-written, finds package root robustly.

**Gaps:** Missing exports:
- `SIGIL_HOME` (`~/.sigil`)
- `SIGIL_ENV_PATH` (`~/.sigil/.env`)
- `SIGIL_DB_PATH` (`~/.sigil/db`)
- `SIGIL_MD_PATH` (`~/.sigil/CLAUDE.md`)
- `CLAUDE_DIR` (`~/.claude`)
- `CLAUDE_MD_PATH` (`~/.claude/CLAUDE.md`)
- `CLAUDE_SETTINGS_PATH` (`~/.claude/settings.json`)

These are currently hardcoded in 20+ places across cli.js (lines 20, 163, 358, 443, 513, 595, 639, 661, 724, 756, 1398, 1424, 1485, 1528, 1637, 1715, 2133, 2134).

**Suggestion:** Add to `lib/paths.js`:
```js
export const SIGIL_HOME = join(homedir(), '.sigil');
export const SIGIL_ENV_PATH = join(SIGIL_HOME, '.env');
export const SIGIL_DB_PATH = join(SIGIL_HOME, 'db');
// ... etc.
```

---

## Summary: Top 10 Improvements

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Extract `lib/paths.js` exports (SIGIL_HOME, etc.) | 15 min | Eliminates 20+ hardcoded paths |
| 2 | Create dispatch maps for `pod`, `session`, `namespace` subcommands | 30 min | Enables adding new subcommands without editing cli.js |
| 3 | Break `runInit()` into `selectLLMProvider()`, `ensureOllamaReady()`, `writeEnvFile()` | 45 min | Reduces cognitive load; testable units |
| 4 | Create `lib/doctor-checks.js` with check registry | 30 min | Enables adding new doctor checks as plugins |
| 5 | Move async imports to function top (not inside if-else) | 20 min | Clearer import structure |
| 6 | Delete 40 step-marker comments (lines 173, 184, 199, ... 492) | 5 min | Reduces noise |
| 7 | Extract `parseFlags()` utility for `--foo=bar` and `--foo bar` | 10 min | Reduces duplication across commands |
| 8 | Define module-level constants (OLLAMA_HEALTH_CHECK_TIMEOUT, etc.) | 10 min | Eliminates magic numbers |
| 9 | Create `lib/command-registry.js` with top-level command dispatch | 30 min | Future-proofs CLI for new commands |
| 10 | Move CLAUDE.md integration (writeSigilMd, writeClaudeMd, registerHooks) to separate file | 20 min | Reduces init size by ~230 lines |

---

## Open Questions

1. **Line 210:** `CORTEX_SYNTH_MODEL` fallback — is this legacy? Check if any remaining references or config files use `CORTEX_*` variables.
2. **Line 812:** `limit: 10000` in `runFacts()` — why 10k? Is this a paging decision or a hard cap?
3. **Line 1647–1651:** `doRegister()` reads `serverPath = join(pkgDir, 'src', 'server.js')` but assumes the file exists. Should check existence.

