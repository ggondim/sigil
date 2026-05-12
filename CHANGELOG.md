# Changelog

All notable changes to `@anmolsrv/sigil`.

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
