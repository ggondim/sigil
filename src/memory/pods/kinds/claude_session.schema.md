# Authoring into `claude_session` pods

A claude_session pod captures **what happened during one Claude Code session**: what the user worked on, what they decided, what they tried that worked, what surprised them. The session pod is ephemeral, its facts decay after 90 days unless reinforced, so extract for the *signal*, not the trace.

## What to extract

- **Decisions made in this session.** "Chose Drizzle over Knex for the new auth service because of TypeScript ergonomics." Not "looked at Drizzle docs."
- **Problems solved + root causes.** "Webhook signature failures were caused by trailing newline in `STRIPE_WEBHOOK_SECRET` env var." The *cause*, not the symptom alone.
- **Conventions discovered or applied.** "We name React components in PascalCase and pages in kebab-case." If it was reinforced this session, save it; the project pod will inherit it.
- **Stuff that surprised the user.** "PGlite doesn't support concurrent writers via file lock, needs the WAL flag." Surprise is signal.

## What NOT to extract

- **Prompts or chat filler.** "User asked how to debug X" is not a fact. The fact is whatever was discovered when answering.
- **File paths or line numbers.** Those belong in chunks/entities, not in facts.
- **Process narration.** "Then I ran tests. They passed. Then I committed." A future session won't care.
- **One-off observations with no transferable lesson.** If it only applies to this exact moment, skip it.

## Style

- One assertion per fact. If a sentence has two facts, split them.
- Past tense for events ("decided to…", "fixed…"), present tense for state ("`mycohort-api` uses…").
- Be specific. "The webhook handler is slow" is useless; "The Stripe webhook handler P95 is 280ms, bottleneck is the bcrypt compare in signature verify" is useful.
- 15-200 characters per fact. Shorter is usually better.

## Importance

Default importance for session-derived facts is `2` (supplementary). Bump to `3` (medium) for cross-session-useful decisions; `4` (high) for project-wide constraints or conventions surfaced for the first time. `5` (vital) is reserved for the user's explicit "remember this forever" requests.
