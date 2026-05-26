# Authoring into `person` pods

A person pod tracks **what you know about someone you work with**: their role, expertise, working style, ongoing initiatives, preferences. Person facts don't decay, relationships are long-running, but they should be *useful*, not just present.

## What to extract

- **Role and scope.** "Maya leads platform engineering at Hatch." "Dhaval owns the mycohort planner roadmap."
- **Expertise.** "Maya has three years of experience building payment infrastructure at consumer fintechs."
- **Preferences and working style** that affect collaboration. "Maya prefers async written specs over meetings for new features."
- **Ongoing initiatives.** "Dhaval is leading the migration of the planner from Redis to Postgres LISTEN/NOTIFY."
- **Past contributions worth remembering.** "Maya wrote the Resilient Payment Webhook Handlers article on the Hatch Eng blog."

## What NOT to extract

- **Anything sensitive, personal, or judgmental.** This pod is operational knowledge, not gossip. If you wouldn't want them to read it, don't save it.
- **One-off context.** "Maya was OOO last Tuesday" is not a person fact.
- **Things derivable from a tool of record.** Their email/Slack handle goes in `platforms`, not as a fact.

## Style

- Always lead with the person's name ("Maya Iyer…") so the fact stands alone outside the pod.
- Past tense for past events ("wrote", "led", "shipped"); present tense for ongoing role/state ("leads", "owns").
- One assertion per fact.

## Importance

Default importance is `3` (medium). Bump to `4` for facts that change *how* you collaborate (working style, communication preferences). `5` (vital) is rare, reserve for facts whose absence would cause real friction (e.g., "Dhaval is the only person with prod database access").
