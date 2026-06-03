# What makes gstack skills work — a teardown for Sigil's agent prompts

> Reverse-engineered from `~/.claude/skills/gstack/` (Garry Tan's Claude Code skill suite: ~52 hand-authored skills + a template/overlay build system). Goal: extract the terminology, structure, preamble conventions, and instruction grammar that make these prompts reliable, so we can apply the same craft to Sigil's connector instructions (`buildSharedInstructions`) and agent-facing prose.

## TL;DR — the 10 things they do that we don't

1. **Prompts are generated, not hand-written.** One `SKILL.md.tmpl` + `model-overlays/` + per-host config → the final `SKILL.md`. Consistency is structural, not disciplined. (Our `buildSharedInstructions` is one hard-coded string for every client — the root cause of the Codex bug.)
2. **A bash preamble runs *before* the model reasons**, computes environment truth (branch, mode, flags), and **echoes it as `KEY: value` lines** the model branches on. Shell does I/O + state; the model does judgment.
3. **Every behavioral knob is surfaced as an echoed variable** with an explicit "If `KEY` is X, do Y; skip if Z" rule downstream. The echoed line is the API between shell and model.
4. **One-time prompts are gated by marker files / config keys** so the agent never re-asks. "The side-effecting action is conditional; the marker write is unconditional."
5. **Decisions are `tool_use`, never prose.** A rigid "decision brief" format (ELI10, Stakes, Recommendation, Pros/Cons ≥40 chars, Net) sent via AskUserQuestion. If AUQ is unavailable the skill is **BLOCKED** — it does not improvise.
6. **Imperative grammar with one capitalized "Iron Law" per skill**, second-person persona ("You are a Release Engineer…"), absolute modals (MUST/NEVER), rationale in terse fragments.
7. **Verification discipline: pre-list the rationalizations the model is prone to and rebut each.** "Confidence is not evidence." "Trivial changes break production." Demand a concrete artifact (file:line, test output) for every claim.
8. **A fixed completion-status enum** — `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT` — and a 3-strike escalation cap.
9. **A shared `## Voice` block + banned-vocabulary list** ("No AI vocabulary: delve, crucial, robust…"), taught by Good/Bad contrastive example.
10. **A two-tier memory system** (durable JSONL "learnings" + per-session "context" handoff) with a salience gate, append-only + last-write-wins, staleness detection, and **recall that announces itself** ("Prior learning applied: [key]").

---

## 1. The layered build system (why their prompts are consistent)

Three layers combine at build time (`bun run gen:skill-docs`):

```
SKILL.md.tmpl        (human prose + {{PLACEHOLDER}} tokens)
      ↓  gen-skill-docs.ts (reads source-code metadata)
      ↓  + host config (hosts/*.ts: claude, codex, cursor, kiro, …)
      ↓  + model overlay (model-overlays/<model>.md)
SKILL.md             (committed, auto-generated, per-host)
```

- **Placeholders** are filled from code, not copy-pasted: `{{PREAMBLE}}`, `{{COMMAND_REFERENCE}}`, `{{MODEL_OVERLAY}}`, `{{GBRAIN_CONTEXT_LOAD}}`, etc. Rationale, verbatim: *"if a command exists in code, it appears in docs. If it doesn't exist, it can't appear."*
- **One template set → 8 hosts.** What changes per host is exactly the table below — and **this is the abstraction we're missing for Sigil's connectors**:

  | Aspect | Claude | Codex |
  |---|---|---|
  | Output dir | `{skill}/SKILL.md` | `.agents/skills/gstack-{skill}/SKILL.md` |
  | Frontmatter | full | minimal (name + description) |
  | Hook skills | `hooks:` frontmatter | inline safety-advisory **prose** (Codex has no hooks!) |
  | Suppressed sections | none | self-invocation sections stripped |

  **Codex literally gets *different prose* because it has no hooks** — gstack solved the exact problem that's breaking Sigil's Codex connector.

- **Committed, not generated at runtime** because the agent reads `SKILL.md` at load time (no build step on invoke), CI can validate freshness (`--dry-run` + `git diff --exit-code`), and git blame works.

**The model overlay** is the lowest-priority layer. Its wrapper text is hardcoded so subordination always appears:

> ## Model-Specific Behavioral Patch (${model})
> The following nudges are tuned for the ${model} model family. They are **subordinate** to skill workflow, STOP points, AskUserQuestion gates, plan-mode safety, and /ship review gates. If a nudge below conflicts with skill instructions, the skill wins. Treat these as preferences, not rules.

Overlays inherit via `{{INHERIT:claude}}` on line 1 (e.g. `opus-4-7.md` builds on `claude.md`; `gpt-5.4.md` on `gpt.md`). Precedence is explicit: **skill workflow > safety/AUQ/plan-mode gates > model nudges.**

---

## 2. The preamble — compute in shell, branch in the model

Every tier-≥2 skill opens with `## Preamble (run first)` — a single bash block that runs before any reasoning. It:

1. Update check (network-capped `curl -sf --max-time 5`, dual path fallback, `|| true`).
2. Session tracking via touch-files keyed on `$PPID`, GC older than 120 min.
3. Config reads with **inline defaults**: `proactive`, `telemetry`, `explain_level`, `checkpoint_mode`, …
4. Marker probes → `yes/no` env values.
5. Git/branch + repo-mode (`source <(gstack-repo-mode) || true`).
6. Slug + learnings load (surfaces top-3 if >5 entries).
7. Plan-mode detection (defaults safe to `inactive`).

**Why bash-before-reasoning:** shell is cheap, reliable, and can mutate state (GC, markers, telemetry) and emit deterministic facts. The model then branches on facts instead of guessing.

### The env-surfacing convention (the core technique)

Shell **echoes `KEY: value`** lines into the transcript; downstream prose says *"If `KEY` is X, do Y."* The echoed line **is the contract.** Full key catalogue:

| KEY | Controls |
|---|---|
| `BRANCH` | grounding for questions + git ops |
| `PROACTIVE` | `false` → never auto-invoke; ask first |
| `REPO_MODE` | `solo` → fix proactively; `collaborative`/`unknown` → flag, don't fix |
| `TELEMETRY` | `off`/`anonymous`/`community` — gates all analytics |
| `EXPLAIN_LEVEL` | `terse` → skip the entire Writing Style section |
| `MODEL_OVERLAY` | names the active behavioral patch |
| `CHECKPOINT_MODE` | `continuous` → auto-commit `WIP:` units |
| `GSTACK_PLAN_MODE` | `active`/`inactive` → gate side effects |
| `SPAWNED_SESSION` | `true` → no AUQ, auto-pick recommended, skip prompts |
| `LEARNINGS` | "N entries loaded" → drives recall |
| `HAS_ROUTING` / `ROUTING_DECLINED` / `VENDORED_GSTACK` | one-time onboarding prompts |
| `UPGRADE_AVAILABLE` / `JUST_UPGRADED` | upgrade flow |

### Defensive shell idioms (and why)
- `|| true` on every optional command — a missing binary must never abort the preamble.
- `2>/dev/null` everywhere — keep noise out of the transcript the model reads.
- **Double-defaulting**: `$(gstack-config get k 2>/dev/null || echo default)` *and* `lookup_default()` inside the binary.
- **Marker files for idempotency**: `[ -f m ] && echo yes || echo no` to read; `touch m` to write.
- **Atomic writes** (`mktemp` + `mv`) — concurrent sessions can't corrupt shared state.
- **Inject-proofing** anything fed to `eval`/`source <(...)` (branch names, cache files are attacker-influenceable).
- **Absolute `~/.claude/skills/gstack/bin/...` paths** — never rely on `$PATH` (the agent's Bash subprocess inherits an unpredictable PATH). *(Sigil already learned this — the baked absolute `dist/daemon.js` path.)*

---

## 3. Gating & one-time prompts (the state machine)

Two mechanisms, used together:

- **Touch-file markers** in `~/.gstack/` (existence = "done"). The invariant, verbatim: the action is conditional but the marker write is unconditional —
  > Always run: `touch ~/.gstack/.telemetry-prompted`
  > Skip if `TEL_PROMPTED` is `yes`.
- **Config keys** for persistent on/off (`proactive`, `routing_declined`, `checkpoint_mode`…), with **empty-string-as-tristate** to distinguish "never asked" from "explicitly false" (`cross_project_learnings` returns `""` intentionally → triggers first-run prompt).

**Prompt ordering is itself a state machine** — each gated on the previous completing, so they surface one-per-session in sequence: lake intro → telemetry → proactive → routing → vendoring.

---

## 4. AskUserQuestion discipline — decisions are tool calls

> Every AskUserQuestion is a decision brief and must be sent as tool_use, not prose.

The decision-brief template:
```
D<N> — <one-line question>
Project/branch/task: <grounding sentence using BRANCH>
ELI10: <plain English a 16-year-old could follow, names the stakes>
Stakes if we pick wrong: <what breaks / what the user sees>
Recommendation: <choice> because <one-line reason>
Completeness: A=X/10, B=Y/10   (or: Note: options differ in kind, not coverage)
Pros / cons:
A) <label> (recommended)
  ✅ <concrete, observable, ≥40 chars>
  ❌ <honest, ≥40 chars>
Net: <one-line synthesis of the tradeoff>
```
Hard rules:
- **Exactly one `(recommended)`** label (a hook parses it; two = refuse).
- **Cap 4 options; "split, never drop"** — with 5+, fire one AUQ per option with `A) Include B) Defer C) Cut D) Hold` buckets. *"the user's option set is sacred."*
- Effort shown dual-scale: `(human: ~2 days / CC: ~15 min)` — "makes AI compression visible at decision time."
- **If no AUQ variant is in the tool list → the skill is `BLOCKED`.** Stop, report `BLOCKED — AskUserQuestion unavailable`, wait. *Do not* write to a file, emit prose-and-stop, or silently auto-decide.

---

## 5. Instruction grammar (the "do-work" house style)

The reliable four-beat template:

1. **Assign a senior-engineer persona.** *"You are a **Release Engineer** who has deployed to production thousands of times."* / *"You are a QA engineer AND a bug-fix engineer."*
2. **Declare one capitalized Iron Law.** *"**IRON LAW: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**"* / *"**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**"*
3. **Gate progress** with `STOP`, stop-lists, and the anti-improvisation clause *"Do not work from memory — that section is the source of truth."*
4. **Demand an artifact per claim + rebut rationalizations.**
   > "Should work now" → RUN IT. · "I'm confident" → Confidence is not evidence. · "I already tested earlier" → Code changed since then. Test again. · "It's a trivial change" → Trivial changes break production.
   > Never say "likely handled" or "probably tested" — verify or flag as unknown.
   > Claiming work is complete without verification is dishonesty, not efficiency.

**Control-flow vocabulary** (each forces a behavior):
- `STOP` / `**STOP.**` — hard halt, surface the blocker, don't advance.
- `BLOCKED` — terminal status; emit the literal string and wait.
- `PLAN MODE EXCEPTION — ALWAYS RUN` — inverse gate, force execution even in plan mode.
- `abort` — softer halt on precondition failure.
- `Only stop for:` / `Never stop for:` — closed enumeration removing agent discretion.
- `Skip this step silently` — anti-noise (opposite of STOP).
- `3-strike rule` — iteration cap → escalate.

**Step structure:** numbered with a literal `Step 0`, decimals to insert without renumbering (`Step 1.5`, `Step 2.5`), and a `## Section self-check` at the end forcing the agent to confirm it Read each applicable section rather than working from memory.

**Emphasis catalogue:**
- ALL-CAPS bare words → enforced tokens the agent must emit verbatim, or non-negotiable rules.
- `**bold**` → rule lead-in labels (`**Honesty rule.**`), weighted imperatives, status tokens.
- `IMPORTANT:` → loudest in-band marker, reserved for cross-tool/sub-agent boundaries.
- `Note:` / `(advisory)` / `(soft directive)` → the deliberate *low*-priority register marking rules the agent must **not** gate on.
- `→` arrows for cause/consequence and rationalization rebuttals.

**Completion status enum** (identical in every skill): `DONE` (with evidence) / `DONE_WITH_CONCERNS` / `BLOCKED` (state blocker + what was tried) / `NEEDS_CONTEXT`. Escalation: *"after 3 failed attempts… Format: STATUS, REASON, ATTEMPTED, RECOMMENDATION."*

---

## 6. Persona & Voice (advisory skills)

Persona opening pattern: `# /<skill> — <Title>` → bold second-person identity → job definition → a HARD GATE on output. e.g. office-hours: *"You are a **YC office hours partner**… This skill produces design docs, not code. **HARD GATE:** Do NOT… write any code… Your only output is a design document."*

Whose judgment is emulated is made explicit via **"Cognitive Patterns"** lists of named thinkers the model is told to *internalize, not enumerate* (Bezos one-way/two-way doors, Munger inversion, Brooks "No Silver Bullet"…). Closing instruction: *"Don't enumerate them; internalize them."*

The shared **`## Voice`** block (identical across skills):
> GStack voice: Garry-shaped product and engineering judgment, compressed for runtime.
> - Lead with the point. Be concrete. Name files, functions, line numbers, commands, real numbers.
> - Tie technical choices to user outcomes.
> - Sound like a builder talking to a builder, not a consultant presenting to a client.
> - No em dashes. No AI vocabulary: delve, crucial, robust, comprehensive, nuanced, multifaceted, furthermore, moreover, additionally, pivotal, landscape, tapestry, underscore, foster, showcase, intricate, vibrant, fundamental, significant.
> - Cross-model agreement is a recommendation, not a decision. The user decides.

Taught by contrastive example:
> Good: "auth.ts:47 returns undefined when the session cookie expires. Users hit a white screen. Fix: add a null check… Two lines."
> Bad: "I've identified a potential issue in the authentication flow that may cause problems under certain conditions."

Plus **anti-sycophancy** rules: *"Be direct to the point of discomfort."* / never say *"That's an interesting approach" — take a position instead.*

Elicitation craft: ask **ONE AT A TIME**, each question carrying an **Ask / Push until you hear / Red flags** triple; **smart-skip** if earlier answers cover it; **STOP after each question, wait for the response.** spec's rule: *"Do NOT proceed until all five are answered without hand-waving."* and *"You quantify everything. 'Several files' is not acceptable — find the exact count."*

---

## 7. Memory patterns (directly relevant to Sigil)

gstack runs a **two-tier** memory system worth copying wholesale:

**Durable "learnings"** — append-only JSONL, auto-captured by every skill via a one-line shell call:
```bash
gstack-learnings-log '{"skill":"cso","type":"pattern","key":"SHORT_KEY","insight":"…","confidence":N,"source":"observed","files":["path/…"]}'
```
- **types:** `pattern` / `pitfall` / `preference` / `architecture` / `tool` / `operational`
- **sources:** `observed` / `user-stated` / `inferred` / `cross-model`
- **confidence 1-10:** observed-in-code = 8-9, inference = 4-5, explicit user preference = 10
- **files:** enables staleness detection — if those files are deleted, flag the learning
- **salience gate (verbatim):** *"Only log genuine discoveries… A good test: would this insight save time in a future session? If yes, log it."*

**Recall announces itself** — exactly the behavior Sigil's own CLAUDE.md prescribes:
> When a finding matches a past learning, display: **"Prior learning applied: [key] (confidence N/10, from [date])"**. This makes the compounding visible. The user should see that gstack is getting smarter on their codebase over time.

**Integrity model:** append-only writes + last-write-wins dedup on `key|type` + file-existence staleness + same-key contradiction detection (surfaced via AUQ `A) Remove B) Keep C) Update`) — no in-place edits. Same conflict model as a CRDT.

**Working context** (`/context-save` ↔ `/context-restore`) is separate from knowledge: markdown + YAML frontmatter (`status / branch / files_modified`), sections "Decisions made / Remaining work / Notes (things tried that didn't work)", append-only, loads "most recent across ALL branches" for handoff. A continuous variant embeds a `[gstack-context]` block into `WIP:` commit messages.

---

## 8. The ETHOS vocabulary (terms reused across every skill)

- **"Boil the Lake"** — *"When the complete implementation costs minutes more than the shortcut — do the complete thing. Every time."* Lakes are boilable; oceans (multi-quarter rewrites) are flagged out of scope. Drives the `Completeness: X/10` scale (10 = all edge cases, 7 = happy path, 3 = shortcut).
- **"Search Before Building" / "Three Layers of Knowledge"** — Layer 1 tried-and-true, Layer 2 new-and-popular (caution: "Mr. Market is too fearful or too greedy"), Layer 3 first-principles ("prize above everything"). Payoff = **"The Eureka Moment"** ("zig while others zag… name it, celebrate it").
- **"User Sovereignty"** — *"AI models recommend. Users decide. This is the one rule that overrides all others."* (Karpathy "Iron Man suit"; generation-verification loop.)
- **"Build for Yourself"** — *"The best tools solve your own problem… The specificity of a real problem beats the generality of a hypothetical one."*

---

## 9. How to apply this to Sigil (concrete next steps)

The Codex bug is a microcosm of every gap above. Mapped:

1. **Make `buildSharedInstructions()` host-aware — adopt the gstack host abstraction.**
   Mirror their `hosts/*.ts` split: a `mode`/`transport` param yields different prose.
   - `hooks` mode (Claude Code): current text — automatic injection + Stop-hook save.
   - `mcp` mode (Codex/Cursor/Kiro/Hermes): **"There is NO automatic injection or saving. ALWAYS call the `search` MCP tool at the start of a task and when you need user/project context. Call `ingest` to save important facts."** Reference the real MCP tool names; drop the `!`-Bash/daemon-CLI lines and the phantom `remember` tool.
   This is the same move gstack makes for Codex (hook frontmatter → inline prose because Codex has no hooks).

2. **Add an Iron Law to the MCP-mode block.** e.g. *"**IRON LAW: nothing is recalled or saved automatically here. If you did not call `search`, you have no memory of this user.**"* — single, capitalized, unmissable.

3. **Borrow the verification/anti-rationalization device for recall.** *"'I probably remember this' → you don't; call `search`. 'The user didn't ask about history' → context still matters; search anyway."*

4. **Adopt the `## Voice` + banned-vocabulary block** in our injected instructions so every connected agent acknowledges recall the same crisp way (we already prescribe acknowledgment — give it the gstack contrastive Good/Bad).

5. **Adopt the announced-recall pattern** verbatim in spirit: have the MCP-mode prose instruct *"When you use a stored fact, name it in one clause so the user sees their context applied"* — we already say this for Claude; it must be in the MCP prose too.

6. **Version the instructions per transport** (gstack uses `INSTRUCTIONS_VERSION` + a marker; we already have `<!-- sigil-instructions:v2 -->`). Bump it when the MCP-mode text lands so existing Codex/Cursor users get rewritten `AGENTS.md` on next `sigil init`.

7. **Longer-term: a tiny "preamble" for connectors that lack hooks.** Where a host supports a session-start or pre-prompt mechanism (Cursor rules with `alwaysApply`, Codex `AGENTS.md` is read every session), lean on it to push a `search` call up front — the closest we can get to gstack's "compute-then-echo" preamble for clients without true hooks.

**Bottom line:** gstack's reliability isn't magic prose — it's (a) generation from one source so every host gets *correct* prose, (b) deterministic shell state echoed as `KEY: value`, (c) decisions forced through a strict AUQ brief, and (d) verification discipline that pre-empts the model's failure modes. Sigil already has the infrastructure (config store, versioned instructions, MCP tools); we're missing the **host-aware generation layer** and the **imperative, verification-first prose**. Fixing `buildSharedInstructions` to be transport-aware is step one and closes the Codex/Cursor/Kiro gap in a single change.
