# ADR-008: Remove Redis, use Postgres LISTEN/NOTIFY

## Status: Accepted (2026-04-12)

## Context
Redis was the third moving part in our infra and we used it for one
thing — pub/sub between API workers and background jobs. The
operational overhead (HA setup, monitoring, backup separately from
Postgres) was disproportionate to a single use case.

## Decision
Replace Redis pub/sub with Postgres LISTEN/NOTIFY. All ephemeral
state moves into the existing Postgres instance. Workers subscribe
on a dedicated, non-pooled connection (LISTEN sessions can't share
pgbouncer-pooled connections in transaction mode).

## Consequences
- One fewer service to operate, monitor, and back up.
- Slightly higher Postgres connection count; manageable with pgbouncer
  for the API path and separate dedicated connections for LISTEN.
- Migration completed 2026-04-20. Three weeks in production, no
  incidents.
