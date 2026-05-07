# Code style — short version

_Last updated 2026-05-01_

## TypeScript
- Strict mode is non-negotiable.
- No `any` without an `// reason: ...` escape-hatch comment.
- Named exports only — never `export default`.
- Validate every external boundary (API request, DB row, env, file IO)
  with a zod schema before the data hits business logic.
- Errors: throw typed errors at the source; catch only at boundaries.

## Testing
- vitest for unit + integration.
- Property-based tests via fast-check for any pure function with a
  non-trivial input space.
- Snapshot tests for stable rendered output only — not for objects
  that change shape across releases.

## Frontend
- Tailwind + Radix. Never reach for Material-UI.
- React state hierarchy: prefer URL state → `useState` → context.
  Never Redux for new code.
- Server components by default; opt into `"use client"` deliberately.

## Database
- All schema changes through migrations runner — no ad-hoc ALTER.
- Foreign keys with `ON DELETE` policy explicit, not implicit.
- Long transactions are forbidden in API path (pgbouncer is in
  transaction-pooling mode).
