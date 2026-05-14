# Changelog

All notable changes to `@anmolsrv/sigil`.

## 0.10.0 — 2026-05-14

### Pod distinction layer

Pod *types* (a hardcoded enum: `session | person | project | connector_workspace | custom`) become **pod kinds** — a declarative registry that any new kind plugs into. New kinds are no longer a schema change; they're a contract file. Hot-context, search, hooks, and CLI all delegate to the registry instead of branching on a fixed list.

**Five built-in kinds (Claude Code-focused):**

- `claude_session` (singleton-live, 6 hot-context slots, 90-day TTL) — replaces the old `session` type. The 0.10.0 migration rewrites existing `pod_type='session'` rows to `'claude_session'`.
- `project` (multi-active, 4 slots, no TTL) — derived from `git rev-parse --show-toplevel` (or cwd if not a git repo); abs path is the identity. Multiple project pods can be active simultaneously across open editors.
- `person` (rolling-24h, 4 slots, no TTL) — existing person type, now with the full kind contract.
- `playbook` (always-active per project, 3 slots, no TTL) — **new procedural-memory kind** (the CoALA gap). User-authored workflows / debug recipes / runbooks; surfaces in hot-context for sessions whose project matches the playbook's `attrs.project`.
- `vital` (virtual, 6 slots) — surfaces facts marked `importance=5` globally, regardless of pod membership. Preserves pre-0.10 vital-facts behavior through the new kind contract.

(`codex_session` and `agent` kinds land in 0.11.0.)

### Each kind ships a markdown schema doc

Karpathy's "third layer" — every built-in kind has a `<name>.schema.md` next to its contract that tells the LLM how to author/update facts for that kind. User overrides at `~/.sigil/schemas/<kind>.md`. The fact extractor reads the relevant schema before producing facts.

### Append-only foundations

Three new `fact` columns lay the groundwork for the bi-temporal arbiter that lands in 0.11.0:

- `importance_score INTEGER` — 1–5 numeric, backfilled from the existing text `importance` (vital→5, high→4, medium→3, supplementary→2, trivial→1). Hot-context now ranks by `importance_score DESC`, then recency — Karpathy's "distraction" failure mode (stale memories surfacing forever) gets the importance-weighted antidote.
- `superseded_at TIMESTAMP` + `superseded_by_fact_uid TEXT` — Graphiti-style supersession columns. Wired but unused in 0.10.0; the conflict-arbiter that populates them ships in 0.11.0.

Existing `valid_from` / `valid_until` already cover event-time validity; no new columns needed there.

### Kind-driven retrieval

- **Hot-context** rewritten as a registry iteration. The hardcoded four-pass blend disappears; each active kind contributes facts up to its declared `hotContextBudget`, virtual kinds (vital) use a custom `fetchFacts` method, pod-backed kinds default to the shared `factsInPodsByRecency` helper.
- **`hybridSearchFacts`** accepts `podIds: number[]` — when set, an EXISTS subquery against `pod_membership` scopes both semantic and keyword CTEs.
- **`search()`** in hybrid.js accepts `podScope`: `null`/`'global'` for full brain, `'auto'` to resolve via `registry.activeKinds(ctx)`, or an explicit pod-name/uid list. MCP `search` tool exposes the parameter so external callers can scope.

### Hooks delegate to active kinds

New `src/memory/pods/hook-dispatcher.js` — the single seam every hook calls. Walks the registry, opens/refreshes pods for every kind whose lifecycle fires on the hook event, and returns the flat pod-uid list to attach to. Result: a fact saved during a Claude Code session auto-attaches to BOTH the `claude_session` pod AND the active `project` pod, with zero per-kind hook code.

### UserPromptSubmit injection: smarter

- Query router (`src/memory/cognitive/query-router.js`) turned ON (was bypassed) — query intent classifies categories, expand, useGraph.
- `podScope: 'auto'` — pod-tiered injection (session → project → person → vital) with `'global'` fallback for fresh installs.
- Token budget (`INJECTION_BUDGET_CHARS=4800` ≈ 1200 tokens) replaces the fixed `MAX_FACTS=8`.

### Session-end synthesizes a durable summary

When a Claude Code session ends, the hook gathers facts attached to the session pod, calls the LLM with `claude_session.schema.md` as system context, and emits one summary fact (60–220 chars). The synthesized fact attaches to BOTH the closing session pod (ephemeral, decays) AND the project pod (durable) via the dispatcher. Cross-session memory: tomorrow's session in the same project sees today's distilled summary.

### Observability

- `sigil why "<query>"` — runs the same hybrid search the UserPromptSubmit hook uses and prints per-fact RRF / pod / kind / importance breakdown. The "why is this fact in my context?" tool.
- `sigil kind list` / `sigil kind show <name>` — inspect registered kinds, their budgets, visibility, TTL, schema doc.
- `sigil context --explain` — instead of writing the snapshot, print the kind-by-kind blend that would be written.
- `sigil doctor` now surfaces the last 5 hook errors from `~/.sigil/.hook-errors.log`. Hooks never block Claude, so silent rot was the pre-0.10 failure mode; this is the cure.

### Notes for upgraders

- Run `sigil migrate` after pulling. The migration rewrites `pod_type='session'` rows to `'claude_session'`, adds three columns to `fact`. Reversible.
- Existing search/hot-context callers don't need to change — `podScope` defaults to `null` (full brain), preserving current behavior. Phase 1 polish (`sigil why`, `sigil kind`) and the auto-attachment of facts to project pods are opt-in via the hooks.
- The retired `types/` directory is gone. If you imported from `src/memory/pods/types/session.js` or `types/person.js`, switch to `src/memory/pods/kinds/claude_session.js` / `kinds/person.js`.
- `codex_session`, `agent`, identity/auth, three-primitive write API, dynamic kind registration, and connectors are deferred to 0.11.0+.

## 0.9.0 — 2026-05-12

### Added — typed memory pods

Pods are typed memory containers (`session`, `person`, `project`,
`connector_workspace`, `custom`) that segregate facts, documents, and entities
by source or subject. They sit on top of the existing fact/entity/document
model — AUDM, fact extraction, entity dedup, and namespaces are unchanged.

**Schema**
- New `pod` table with `pod_type` discriminator + `attrs` jsonb. Partial-unique
  on `(pod_type, external_id, namespace)` for idempotent upserts.
- New `pod_membership` polymorphic junction (`fact` | `document` | `entity`).
  Many-to-many so a fact can live in both a session pod and a person pod.
- `document.source_metadata` jsonb + `connection_id` FK so the ingest pipeline
  finally persists the metadata it previously dropped.

**Pipeline**
- `ingestDocument()` accepts optional `podUids: string[]` and
  `resolvePodsFrom: 'metadata'` for connector-derived attachment.
- Facts inherit their document's pod set automatically (thought fast-path
  and main path).
- Entity merger reassigns `pod.entity_id` from duplicate → primary on merge,
  archiving the duplicate's pod if the primary already has one.

**Hooks**
- `stop.js` and `post-tool-use.js` read `session_id` from the Claude Code
  hook envelope, ensure a session pod via `~/.sigil/.active-session.json`,
  and attach extracted facts.
- New `SessionEnd` hook closes the active session pod and writes
  `attrs.conclusion` if Claude provided one.

**Hot-context**
- `getHotFacts()` becomes a four-pass blend: 6 slots for the active session
  pod, 4 for person pods touched in the last 24h, 8 for global vital facts,
  2 reserved for project pods. Falls back to recency for installs without
  pods.

**CLI**
- `sigil session current | list | show` — inspect the active session pod.
- `sigil pod list | show | create | archive | delete` — manage pods.
  `sigil pod create --type=person --name="…" --slack=U… [--github=…]
  [--email=…] [--role="…"]` creates a person pod and its canonical entity.

**MCP tools**
- `list_pods(type?, namespace?, status?, limit?)`
- `get_pod(uid)` — pod metadata + up to 20 member facts + 10 member documents.

### Added — entity-level Hebbian co-retrieval edges

Sibling of fact-level Hebbian, working at the entity layer so the learned
graph survives paraphrase and AUDM fact splits.

- New `entity_hebbian_edge` migration with `strength NUMERIC`, lex canonical
  order, indexes on both endpoints.
- Capped increment update (`LEAST(strength + eta, cap)`) on write; lazy
  exponential decay (`lambda = ln2 / halfLifeDays`) computed in SQL on read
  — no background decay job.
- Fire-and-forget write integration from hybrid search, bounded by
  `config.hebbian.entity.maxWriteEntities`.
- Read integration: third RRF signal via `applyCoRetrievalBoost` + graph
  expansion via `expandWithCoRetrievedEntities` widens the seed entity set
  for `useGraph` traversals.
- Hybrid search tests now mock `llm.js`, so the 51-test suite runs in
  ~300ms instead of ~32s.

### Migration notes

Three new migrations land in `0.9.0`:
- `20260512120000_create-pod-tables.cjs`
- `20260512120000_create-entity-hebbian-edge.cjs` (same timestamp prefix,
  different filename — Knex orders by full name, no conflict)
- `20260512120100_create-pod-membership.cjs`
- `20260512120200_add-document-source-metadata.cjs`

All additive. Existing data needs no backfill — pod_membership starts
empty and NULL membership means "global namespace knowledge" (same mental
model as today).

Run `sigil migrate` after upgrading, then `sigil init` to register the
new `SessionEnd` hook.

## 0.8.x

See git history for prior releases.
