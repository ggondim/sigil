# ADR-001: API response envelope

## Status: Accepted (2026-03-05)

## Context
We have three services and two of them return different shapes on
errors. The frontend client has bespoke per-service error handling.
Cleaning this up before we add a fourth service.

## Decision
Every API response wraps in a single envelope:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "...", "details": {...} } }
```

- `ok` is always present and boolean.
- On success, `data` is present; `error` is absent.
- On failure, `error` is present; `data` is absent.
- HTTP status still carries semantic meaning, but the envelope is the
  source of truth for client-side branching.

## Consequences
- One frontend client wrapper handles all services going forward.
- Logs and alerts pivot on `ok=false` regardless of HTTP code.
- New endpoints inherit the contract by default; deviations need an ADR.
- Migrated existing endpoints over the last week of March; no incidents
  tied to envelope inconsistency since.
