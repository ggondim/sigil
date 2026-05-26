# Authoring vital facts (`importance=5`)

A "vital" fact is **truth the user should never have to re-establish**. It surfaces in every session, regardless of project, regardless of pod scope. The bar is high: vital facts are the smallest set of things whose absence would degrade *every* interaction.

This is a virtual kind, vital facts don't live in their own pod. They are facts (in any pod) tagged with `importance=5`, surfaced globally by the hot-context blend.

## What qualifies as vital

- **Identity.** Who the user is, what they do, who they work with at the highest level. ("Anmol leads engineering at Airtribe.")
- **Hard preferences.** Things the user has stated explicitly and would re-state if asked. ("User prefers tabs over spaces.")
- **Cross-project constraints.** Conventions, security rules, or commitments that apply to everything. ("Never commit `.env` files; always use `pnpm`.")
- **Inviolable architectural commitments.** "All ephemeral state lives in Postgres." (Project-pod material if scoped; vital if cross-project.)

## What does NOT qualify

- **Recent activity.** Use claude_session or project pods.
- **Person-specific knowledge.** Use person pods.
- **Procedural recipes.** Use playbook pods.
- **Anything that might change in 90 days.** If it's evolving, it's not vital, it's just important.

## Style

- One assertion per fact.
- Present tense, declarative ("User uses…", "Never commit…", "The project uses…").
- Self-contained, vital facts surface out of context, so they have to read as standalone truth.
- Short. 15-120 characters is the sweet spot.

## Setting importance

The LLM extractor can suggest `importance=5` only when there's strong signal: explicit "remember this", a commitment the user has restated, or a cross-project constraint clearly stated. When in doubt, default to `3` or `4`; promotion to vital can happen later by the user or by the maintenance arbiter.
