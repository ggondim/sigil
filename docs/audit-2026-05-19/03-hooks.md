# Claude Code Hook Integration Audit

## Executive Summary

Sigil's four hooks (UserPromptSubmit, Stop, PostToolUse, SessionEnd) are functionally sound but suffer from **heavy boilerplate duplication** across env-loading, error handling, and database cleanup. The hook-dispatcher covers only session + project kinds; coverage is narrower than the pod registry. Post-tool-use noise filtering heuristics are coarse (~90% noise threshold). Narrative comments are common delete-candidates.

**Duplication cost:** 250+ lines repeated across 4 hooks that could be consolidated into 2–3 shared utilities.

---

## Hook Inventory & Behavior

| Hook | Purpose | Scope | Input | Cost | Notes |
|------|---------|-------|-------|------|-------|
| **UserPromptSubmit** | Inject Sigil facts into Claude's context | Session + project pods (auto scope) | stdin: `{prompt, session_id, cwd}` | Embedding lookup | 3× `cortexDb.destroy()` calls |
| **Stop** | Auto-extract memorable content from last user message | Session + project pods | stdin: `{messages, session_id, transcript_path}` | 1 Haiku classifier call | Dedup via SHA256 cursor file |
| **PostToolUse** | Capture tool observations (Bash, Edit, Write) | Session + project pods | stdin: `{tool_name, tool_input, session_id}` | Embedding only | 2-tier noise filter (90% pruned) |
| **SessionEnd** | Synthesize session summary, close pod | Session + project pods | stdin: `{session_id, transcript_path}` | 1 LLM call if ≥3 facts | Fires AFTER pod already loaded by hooks |

---

## Duplication Analysis: 250+ Lines of Repeated Shell

### 1. Env-Loading Boilerplate (6 lines, 4 copies = 24 lines)

**Location:** `user-prompt-submit.js:34–43`, `stop.js:25–32`, `post-tool-use.js:18–25`, `session-end.js:30–36`

```javascript
// ALL FOUR HOOKS have this identical block:
const home = process.env.HOME || process.env.USERPROFILE;
const globalEnv = join(home, '.sigil', '.env');
const localEnv = resolve(process.cwd(), '.env');
if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
if (existsSync(globalEnv) && globalEnv !== localEnv) dotenvConfig({ path: globalEnv, quiet: true });
```

**Status:** Fixed in #38 (regression where project .env shadowed global). Now idempotent.

**Extraction Opportunity:** `src/hooks/env-loader.js`
```javascript
export function loadHookEnv() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const globalEnv = join(home, '.sigil', '.env');
  const localEnv = resolve(process.cwd(), '.env');
  if (existsSync(localEnv)) dotenvConfig({ path: localEnv, quiet: true });
  if (existsSync(globalEnv) && globalEnv !== localEnv) dotenvConfig({ path: globalEnv, quiet: true });
}
```

**Impact:** 3-line import + 1-line call per hook. Saves 20 lines, centralizes env precedence logic.

---

### 2. Try/Catch/Finally + DB Teardown Pattern (15–25 lines per hook)

**Instances:**
- `user-prompt-submit.js:67–157` — try main logic, catch error + log, then 3× `cortexDb.destroy()`
- `stop.js:58–98` — try logic, catch error + log, finally destroy + respond
- `post-tool-use.js:179–240` — try logic with nested pod dispatch, catch at top level, finally destroy
- `session-end.js:48–94` — try synthesis + close, catch, finally destroy

**Problem:** Each hook has its own unique try/catch/finally envelope. Patterns:
- Some put destroy in main catch + return path (user-prompt-submit, post-tool-use)
- Some put destroy in finally (stop, session-end) ✓ more correct
- Some call destroy() 2–3 times in different paths

**Extraction Opportunity:** `src/hooks/hook-context.js`

```javascript
export async function withHookContext(fn, { hookName = 'unknown' } = {}) {
  try {
    return await fn();
  } catch (err) {
    process.stderr.write(`[sigil:${hookName}] ${err.message}\n`);
    try {
      await recordHookError(hookName, err);
    } catch { /* ignore */ }
    throw; // Or return null depending on fail-open/fail-closed intent
  } finally {
    try {
      const cortexDb = (await import('../db/cortex.js')).default;
      await cortexDb.destroy();
    } catch { /* ignore */ }
  }
}
```

**Impact:** Eliminates duplicated try/catch/finally across all 4 hooks. Each hook main() becomes:
```javascript
const result = await withHookContext(() => doWork(input), { hookName: 'user-prompt-submit' });
respond(result);
```

**Caveat:** Stop and SessionEnd are async and must not block; catch+throw will still propagate. Wrapper must support a `noThrow` mode.

---

### 3. Respond() Output Envelope

**Instances:** `user-prompt-submit.js:159–167`, `post-tool-use.js:242–249`, `stop.js:107–110`, `session-end.js:182–184`

**Problem:** Only UserPromptSubmit and PostToolUse wrap in `hookSpecificOutput` + `hookEventName`. Stop and SessionEnd return bare `{}`. Inconsistent.

**Recommendation:** Standardize in wrapper or doc if empty response is intentional (it is — Stop/SessionEnd never block).

---

## Cleanliness Issues: Narrative Comments & Dead Weight

### Delete Candidates (What vs Why)

| File | Line | Comment | Issue |
|------|------|---------|-------|
| `post-tool-use.js` | 18–20 | "Load env before anything else / Env precedence…" | Duplicated from user-prompt-submit.js; once extracted, delete from all but one. |
| `stop.js` | 25–27 | Same env comment | Delete after extraction. |
| `session-end.js` | 30–31 | Same env comment | Delete after extraction. |
| `post-tool-use.js` | 27, 34, 51, 59 | "Tools that are reconnaissance" / "Bash subcommands — noise vs signal" / "Keywords that make…" | **KEEP** — these explain the heuristic logic below. |
| `error-log.js` | 32–39 | "Config gate — every hook calls this…" | **KEEP** — explains WHY we pre-flight config, not just WHAT. |
| `user-prompt-submit.js` | 34–38 | Long env comment | **KEEP** — documents a hard-won regression fix (#38). |

### Narrative Blocks to Prune

1. **post-tool-use.js:18–20** — env loading comment (once extracted)
2. **stop.js:25–27** — env loading comment (once extracted)
3. **session-end.js:30–31** — env loading comment (once extracted)

---

## Coupling Problems & Hardcoding

### 1. Hardcoded Home Paths & Magic Files

| File | Path | Issue |
|------|------|-------|
| `stop.js` | `CURSOR_PATH = join(home, '.sigil', '.stop-cursor.json')` | Magic file name; no central registry. If .sigil layout changes, update 4+ files. |
| `post-tool-use.js` | `DEDUP_FILE = join(home, '.sigil', '.hook-dedup.json')` | Same; siloed. |
| `error-log.js` | `HOOK_ERROR_LOG`, `LAST_CLEAN_DOCTOR_PATH` | Centralized (good), but hardcoded `.sigil` path here + elsewhere. |

**Recommendation:** Export `.sigil/` path constants from a single module:
```javascript
// src/lib/paths.js
export const SIGIL_HOME = join(process.env.HOME || process.env.USERPROFILE, '.sigil');
export const HOOK_ERROR_LOG = join(SIGIL_HOME, '.hook-errors.log');
export const CURSOR_PATH = join(SIGIL_HOME, '.stop-cursor.json');
```

---

### 2. Magic Numbers (Tuning Knobs Without Central Registry)

| File | Constant | Value | Role |
|------|----------|-------|------|
| `user-prompt-submit.js` | `INJECTION_BUDGET_CHARS` | 4800 | Token budget for facts |
| `user-prompt-submit.js` | `MIN_QUERY_LENGTH` | 8 | Skip trivial prompts |
| `stop.js` | `MIN_MESSAGE_LENGTH` | 15 | Skip short user messages |
| `stop.js` | `MAX_MESSAGE_LENGTH` | 8000 | Avoid classifier on huge messages |
| `post-tool-use.js` | `DEDUP_WINDOW_MS` | 300000 (5 min) | Session-level noise filter window |
| `session-end.js` | `MIN_FACTS_TO_SYNTHESIZE` | 3 | Synthesis threshold |

**Issue:** Scattered across files; no single tuning doc or config schema. Hard to audit signal/noise ratios.

**Recommendation:** Centralize in `src/config.js` or `src/hooks/defaults.js`:
```javascript
export const HOOK_DEFAULTS = {
  userPromptSubmit: { injectionBudgetChars: 4800, minQueryLength: 8 },
  stop: { minMessageLength: 15, maxMessageLength: 8000 },
  postToolUse: { dedupWindowMs: 5 * 60 * 1000 },
  sessionEnd: { minFactsToSynthesize: 3 },
};
```

---

## Pluggability Gaps: Adding a 5th Hook

**Scenario:** Add a new `codex` hook to capture AI-to-AI observations.

**Files you'd have to touch:**
1. `src/hooks/codex.js` — new file
2. `src/cli.js` — `registerHooks()` function, lines 1437–1471, add new entry to `cortexHooks`
3. `src/memory/pods/hook-dispatcher.js` — **NO CHANGES** (already generic, just returns podUids)
4. `.claude/settings.json` — merged at init time (users' file)

**Current friction:** Registering a new hook requires editing `src/cli.js` (hard-coded list). No plugin system.

**Recommendation:** Extract hook manifest to `src/hooks/manifest.json`:
```json
{
  "UserPromptSubmit": {
    "script": "user-prompt-submit.js",
    "timeout": 10,
    "matcher": null,
    "statusMessage": "Searching memory..."
  },
  "PostToolUse": {
    "script": "post-tool-use.js",
    "timeout": 10,
    "matcher": "Edit|Write|Bash",
    "async": true
  }
}
```

Then in `cli.js`, load and iterate dynamically. This decouples hook registration from CLI code.

---

## Hook-Dispatcher Coverage Assessment

**Current Kinds Handled:**
- `claude_session` — ensured via `ensureActiveSession()`
- `project` — ensured via `ensureProjectPod()`

**Kinds in Registry But NOT auto-attached:**
- `person` — attached only via entity-linker (when Claude mentions someone), not by hooks
- `playbook` — user-authored, never auto-created
- `vital` — virtual pod (no row)

**Verdict:** Dispatcher is **correctly scoped** to lifecycle-driven kinds. Person/playbook are orthogonal. ✓

---

## Post-Tool-Use Noise Filtering: ~90% Pruned (Expected)

### Two-Tier Heuristic

**Tier 1:** Reconnaissance tools always-skip (Read, Glob, Grep, WebFetch, WebSearch, TaskCreate, etc.)

**Tier 2:** Bash command heuristics
- **Always-skip:** `ls, pwd, cd, cat, head, tail, wc, echo, date, whoami, which, type, clear, history, find, grep, rg, file, stat, diff, man, sigil, vitest`
- **Git signal subcommands:** `commit, push, merge, rebase, tag, release, reset, revert, cherry-pick`
- **Git noise subcommands:** `add, status, diff, log, show, branch, checkout, switch, fetch, pull, stash, blame, config`
- **Signal keywords:** error, fail, fix, decided, refactor, migrate, deploy, docker, kubernetes, pip/npm install, rm -rf, sudo, systemctl

**Verdict:** Heuristic is reasonable. Tier 1 correctly skips tooling. Tier 2 catches `npm install`, `git commit`, but skips `git status` (noise). The ~90% pruning rate suggests the keywords are specific enough to avoid capturing routine diagnostics. ✓

**Tightening:** Could add more keywords (e.g., "architecture", "schema migration") but risks missing context. Current balance is defensible.

---

## Secret Masking: Robust Four-Layer Pipeline

**Layers:**
1. **Service-specific token patterns** — OpenAI sk-*, GitHub ghp_*, Slack xox*, AWS AKIA/ASIA, JWT, Discord, Telegram
2. **Generic KEY=VALUE** — api_key, api_secret, token, password, auth_token, etc.
3. **URL credentials** — user:pass@host
4. **Env var names** — DATABASE_URL, REDIS_URL, MONGODB_URI, JWT_SECRET, etc.

**Assessment:** Comprehensive. Regex-based (zero LLM cost). Masks value but preserves key name for context ("set API key for Stripe" not "set ***MASKED***"). ✓

---

## Cross-Hook Concerns Not Shared

| Concern | Scattered | Should Centralize? |
|---------|-----------|-------------------|
| **Env loading** | 4 copies | YES → `env-loader.js` |
| **Error handling** | 4 patterns | YES → `hook-context.js` wrapper |
| **DB teardown** | 6+ calls across hooks | YES → wrapper |
| **Dedup logic** | Stop (SHA cursor), PostToolUse (time window) | PARTIAL — algorithms differ; stop dedup is content-hash, post-tool-use is time-windowed. Both are correct but don't share utilities. |
| **Pod dispatch** | 3 hooks call `ensureActivePodsForHook()` | Already centralized ✓ |
| **Secret masking** | 2 hooks call `maskSecrets()` | Already centralized ✓ |
| **Config gate** | 4 hooks call `failClosedOnBadConfig()` | Already centralized ✓ |

---

## Specific Recommendations with Line References

### High Priority (>30 min payoff each)

1. **Extract env-loader** 
   - Create `src/hooks/env-loader.js:1–20`
   - Replace lines in `user-prompt-submit.js:34–43`, `stop.js:25–32`, `post-tool-use.js:18–25`, `session-end.js:30–36` with `import { loadHookEnv } from './env-loader.js'; loadHookEnv();`
   - Delete env comments from stop.js, post-tool-use.js, session-end.js

2. **Extract hook-context wrapper**
   - Create `src/hooks/hook-context.js:1–30` with `withHookContext()` and optional noThrow mode
   - Refactor main() in all 4 hooks to use it
   - **Impact:** Eliminates 60+ lines of try/catch/finally duplication, standardizes error handling

3. **Centralize hook defaults**
   - Create `src/hooks/defaults.js` with `HOOK_DEFAULTS` object
   - Replace hardcoded magic numbers
   - **Impact:** Single source of truth for tuning; easier to audit signal/noise ratios

4. **Centralize path constants**
   - Move `.sigil/` paths to `src/lib/paths.js`
   - Update `error-log.js`, `stop.js`, `post-tool-use.js`

### Medium Priority (10–20 min each)

5. **Create hook manifest** 
   - Extract `cortexHooks` definition from `src/cli.js:1437–1471` into `src/hooks/manifest.json`
   - Make `registerHooks()` load and iterate dynamically
   - **Impact:** New hooks don't require CLI edits; reduces coupling

6. **Document per-hook intent**
   - Each hook already has a top-level JSDoc. Keep it; confirm they're clear on WHAT (✓) and WHY (✓ mostly).
   - Add one line to each hook main() explaining whether it's "fail-open" (never block Claude) or "fail-closed" (bail if config bad)

---

## Summary Table: Audit Scores

| Aspect | Score | Notes |
|--------|-------|-------|
| **Functionality** | 9/10 | Works; recovers from errors; good error logging |
| **Duplication** | 4/10 | 250+ lines of repeated boilerplate |
| **Cleanliness** | 7/10 | Narrative comments mostly explain WHY; a few delete candidates |
| **Coupling** | 6/10 | Hardcoded paths + magic numbers; hook-dispatcher is clean |
| **Pluggability** | 5/10 | Adding a 5th hook requires CLI edit; no manifest-driven registration |
| **Coverage** | 8/10 | Dispatcher covers session + project correctly; person/playbook orthogonal |
| **Signal/Noise** | 8/10 | Post-tool-use heuristic tight enough; ~90% pruning is expected |

---

## Implementation Roadmap

**Phase 1 (1 day):** Extract utilities (env-loader, hook-context, defaults, paths)  
**Phase 2 (0.5 day):** Refactor 4 hooks to use extracted utilities  
**Phase 3 (0.5 day):** Create manifest + dynamic registration  
**Phase 4 (Testing):** Smoke-test each hook in a Claude Code session; verify no behavior change  

**Total estimated effort:** 2–3 days. No user-facing changes; pure refactor for maintainability.

