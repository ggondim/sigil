# Sigil Audit — Master Plan & Prioritized Improvements

**Date:** 2026-05-19
**Synthesized from:** 01-onboarding-cli.md, 02-providers-config.md, 03-hooks.md, 04-memory-core.md, 05-retrieval-ingestion-mcp.md

## Cross-cutting themes

Five themes appear in every per-module report:

| Theme | Where it shows up | Cost today |
|---|---|---|
| **Boilerplate duplication** | Provider files (~70% identical), hooks (~250 lines repeated), RRF constants in 2 files | High — drift risk + churn for trivial changes |
| **Hardcoded paths** | `~/.sigil` and `~/.claude` in 20+ files | Medium — every move/rename touches many files |
| **Narrative comments** | ~40 in `cli.js`, many in providers, hooks | Low — but user explicitly asked for cleanup |
| **Manual dispatch (if-else chains)** | CLI subcommands (`pod`, `session`, `namespace`), provider detection, doctor checks | Medium — adding variants touches the wrong file |
| **Pluggability gaps** | Pod kinds, fact categories, providers all hardcode-registered | Medium — blocks the 0.12.0 dynamic-kind plan |

## Prioritized tiers

Effort estimates assume one engineer (you or me) working focused.

### Tier 1 — High impact, low risk, no behavior change (~3 hours)

These are pure refactors. Tests don't break, public interfaces unchanged. **Start here.**

| # | Task | Effort | Files touched | Impact |
|---|---|---|---|---|
| T1.1 | Consolidate paths in `src/lib/paths.js` | 20 min | New constants in `paths.js`, replace 20+ hardcoded `~/.sigil`/`~/.claude` references | Single source of truth; future moves edit 1 file |
| T1.2 | Extract `loadHookEnv()` helper, replace 4× duplicated env-loading | 15 min | New `src/hooks/env-loader.js`, edit 4 hook files | Eliminates 24 lines of dup, centralizes env precedence fix |
| T1.3 | Extract `withHookContext()` wrapper for try/catch/finally + db.destroy | 30 min | New `src/hooks/hook-context.js`, edit 4 hook files | Eliminates 60+ lines of dup; consistent cleanup |
| T1.4 | Consolidate RRF/weight constants in `src/memory/search/filters.js` | 10 min | Move constants to filters.js, import in hybrid.js + hybrid-sql.js | Eliminates drift risk |
| T1.5 | Club imports where 3+ from same module across `cli.js`, `hybrid.js`, hooks | 20 min | Cosmetic edits | Cleaner top-of-file |
| T1.6 | Delete narrative section-marker comments per audit findings | 30 min | `cli.js` (~40 lines), provider files (~10 lines), hooks (~5 lines) | Removes ~55 noise lines |
| T1.7 | Define module-level constants for magic numbers (`OLLAMA_HEALTH_CHECK_TIMEOUT`, etc.) | 15 min | `cli.js` mostly | Removes magic numbers |
| T1.8 | Move dynamic `await import()` calls to top of function where dry-run logic doesn't justify laziness | 20 min | `runDoctor`, `runPod`, `runSession` in `cli.js` | Faster, cleaner |

**Goal for this batch:** ship a single commit "refactor: Tier 1 audit cleanups" with no behavior change, 55/55 tests pass.

### Tier 2 — Medium impact, medium risk, surface changes (~5 hours)

These introduce new abstractions. Public API mostly unchanged but internal shape shifts.

| # | Task | Effort | Files touched | Impact |
|---|---|---|---|---|
| T2.1 | Provider manifest (`src/lib/llm/provider-config.js`) — single source for env-var→field mapping | 60 min | New manifest; refactor `registry.js`, `config.js`, `config-validator.js` to consume it | Adding a provider = edit 1 file (manifest) |
| T2.2 | OpenAI-compatible factory for openai/openrouter/ollama LLM providers | 90 min | New `src/lib/llm/providers/openai-compatible.js`; shrink 3 provider files by ~70% | ~150 lines deleted, single tested fetch+parse path |
| T2.3 | Embedder factory for openai/voyage | 45 min | New `src/lib/llm/embedders/fetch-embedder.js`; shrink 2 embedder files | ~80 lines deleted |
| T2.4 | Doctor checks registry (`src/lib/doctor-checks.js`) | 45 min | Move inline checks to registry entries; `runDoctor` iterates | New checks = add an entry, no `cli.js` edit |
| T2.5 | Subcommand dispatch maps (`pod`, `session`, `namespace`) | 30 min | Replace if-else chains in 3 CLI commands | New subcommands = add to map |
| T2.6 | Hook manifest for registration (move from `cli.js` to `src/hooks/manifest.js`) | 45 min | Extract registration data | New hooks = update manifest |

**Goal:** ship as 2-3 commits — one per related set of changes. Tests still pass; internal shape shifts but public CLI/MCP surface unchanged.

### Tier 3 — High impact, requires architectural decisions (~1-2 days each)

Defer to a separate sprint after Tier 1+2 are validated in real use.

| # | Task | Why defer |
|---|---|---|
| T3.1 | Pod kind runtime registration (SDK/CLI path) | Part of the 0.12.0 plan; needs the application layer to validate the API |
| T3.2 | Fact category runtime registration | Same — wait for an agent that needs a custom category |
| T3.3 | Break `runInit()` into 4-5 focused functions | Significant restructure; do after Tier 2's helpers exist |
| T3.4 | Add retry to AUDM LLM calls + audit prompt versioning | Reliability work, but AUDM hasn't been a hotspot |
| T3.5 | Batch entity type updates (single SQL vs N queries) | Performance — only matters at scale we haven't hit |

### Tier 4 — Defer or skip

- Plugin loading for kinds from `~/.sigil/kinds/` — wait for 0.12.0
- Hot reload of provider configs — no real need
- Comprehensive end-to-end test harness expansion — current 55 tests are adequate
- "Memory poisoning" defense beyond TTL — premature for one-user install

## Module-by-module summary (one-liners)

| Module | Health | Top priority |
|---|---|---|
| **Onboarding + CLI** | Functional, bloated | Tier 1.1 (paths), 1.6 (comments), 2.4 (doctor registry), 2.5 (subcommand maps) |
| **Providers + Config** | Functional, very duplicated | Tier 2.1 (manifest), 2.2 (factory), 2.3 (embedder factory) |
| **Hooks** | Just hardened, still duplicated | Tier 1.2 (env-loader), 1.3 (hook-context) |
| **Memory core** | Clean, some hardcoding | Tier 3.1 (kind registry runtime), 3.2 (category registry) — defer |
| **Retrieval + Ingestion + MCP** | Clean, two-file constant dup | Tier 1.4 (RRF constants), watch hybrid.js bloat |

## Risks + how I'll mitigate

| Risk | Mitigation |
|---|---|
| Tier 1 cleanups inadvertently break a hook env load | Run all 55 tests after every commit. Also run `sigil doctor` after path changes. |
| Comment deletions remove load-bearing context | Only delete WHAT-comments (section dividers, step markers). Keep all WHY-comments. |
| Tier 2 factory abstraction adds new test failure modes | Add one focused smoke test per factory before swapping providers over. |
| User adds a Tier 3 ask while Tier 1 is in flight | Hold strictly to Tier 1 boundary; queue new asks. |

## What I'll execute right now (this session)

**Tier 1, all 8 items, single commit.** Estimated 2-3 hours. Final state: 55/55 tests pass, no behavior change, ~150 lines net deletion, single-source-of-truth for paths + env-loading + constants.

Then check in with you before tackling Tier 2.

Out of scope for this session: any Tier 2/3 work, agent path, sources abstraction, benchmark re-runs.
