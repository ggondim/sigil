# Authoring into `project` pods

A project pod accumulates **durable knowledge about a codebase** across many sessions: its architecture, conventions, constraints, deploy paths, who works on it, what hurts. Project facts don't decay, they're the long memory of how this project actually works, distilled from a hundred sessions.

## What to extract

- **Architecture decisions**, chosen stack, key library choices and *why*, abandoned approaches and the reason they were abandoned.
- **Conventions**, naming, file layout, commit style, branching, code style preferences not in lint config, deploy cadence.
- **Constraints**, performance budgets, security requirements, compliance gates, version compatibility.
- **Operational reality**, how deploys happen, who runs the on-call, where the dashboards are, what the slow queries are.
- **Project entities**, services, modules, key files, third-party integrations, people who own pieces of it.

## What NOT to extract

- **Session-specific narration.** That belongs in a claude_session pod (which will decay).
- **Personal preferences unrelated to the project.** "User prefers tabs" lives in a vital fact, not a project pod.
- **Code excerpts.** Use chunks or entities; project facts describe state and choices, not implementation.
- **Things still actively debated.** Wait until a decision lands; otherwise the project pod accumulates noise.

## Style

- One assertion per fact.
- Always name the project explicitly the first time it appears in a fact ("mycohort-api uses…").
- Past tense for *decisions* ("We chose Postgres LISTEN/NOTIFY over Redis pub/sub in April 2026 because…"), present tense for *state* ("All ephemeral state lives in the Postgres instance").
- Capture the *why* whenever possible. Decisions without reasons become folklore that future-you can't relitigate.

## Importance

Default importance is `3` (medium). Bump to `4` (high) for foundational architecture or constraints. `5` (vital) for things that, if forgotten, would cause real damage (security gates, compliance rules, deploy footguns).
