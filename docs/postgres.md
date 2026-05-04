# Using Cortex with real Postgres

Cortex defaults to **PGlite** — an embedded WASM Postgres that lives in `~/.cortex/db/` with no server process. This is the right choice for personal, single-developer use: zero install, zero cost, no Docker.

PGlite has one structural limitation: it's **single-process, single-connection**. If you have multiple Cortex CLI invocations, multiple Claude Code sessions with the MCP server registered, or anything else that wants concurrent DB access, you'll hit `Aborted()` errors. PGlite's data files also can't be inspected by standard Postgres tools (Postico, pgAdmin, `psql`) because there's no socket to connect to.

**When to switch to real Postgres:**
- You want to inspect Cortex data via Postico / pgAdmin / `psql`
- You're running multiple Cortex processes concurrently (CLI + MCP + dashboard)
- You hit repeated lock-up issues (`Aborted()` even after `cortex doctor --kill-stale`)
- You're deploying Cortex to a shared environment, server, or container

**When to stay on PGlite:**
- Single-developer, single-machine personal use
- You want zero install friction
- You don't need external tooling to see your data

## Setup

### 1. Install Postgres + pgvector

The Cortex schema needs the `pgvector` extension. Three common paths:

**macOS via Homebrew:**
```bash
brew install postgresql@17
brew install pgvector
brew services start postgresql@17
```

**Docker (matches the dev setup in this repo's project `.env`):**
```bash
docker run -d \
  --name cortex-pg \
  -e POSTGRES_USER=cortex_app \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=cortex \
  -p 5432:5432 \
  pgvector/pgvector:pg17
```

**Linux:** Install Postgres 14+ from your distro, then `apt install postgresql-17-pgvector` (or compile pgvector from source).

### 2. Create the database and enable pgvector

```bash
psql -U postgres
> CREATE DATABASE cortex;
> CREATE USER cortex_app WITH PASSWORD 'changeme';
> GRANT ALL PRIVILEGES ON DATABASE cortex TO cortex_app;
> \c cortex
> CREATE EXTENSION IF NOT EXISTS vector;
> GRANT ALL ON SCHEMA public TO cortex_app;
> \q
```

### 3. Tell Cortex to use it

Add to `~/.cortex/.env`:

```
CORTEX_DB_TYPE=postgres
CORTEX_DB_HOST=localhost
CORTEX_DB_PORT=5432
CORTEX_DB_NAME=cortex
CORTEX_DB_USER=cortex_app
CORTEX_DB_PASSWORD=changeme
```

### 4. Run migrations

```bash
cortex migrate
```

This creates all the tables, indexes, and triggers in your Postgres database. You can now `cortex remember`, `cortex search`, `cortex status` as normal — everything goes to Postgres.

### 5. Verify in Postico

Connect Postico to `localhost:5432`, database `cortex`, user `cortex_app`. You'll see tables like `fact`, `chunk`, `entity`, `fact_lifecycle`, `hebbian_edge`, etc. Each `cortex remember` shows up in `fact` immediately.

## Migrating existing PGlite data to Postgres

If you have existing data in `~/.cortex/db/` that you want to carry over:

```bash
# 1. Export from PGlite (Cortex defaults to PGlite when CORTEX_DB_TYPE is unset)
unset CORTEX_DB_TYPE                                    # ensure we read from PGlite
cortex export --format=json > /tmp/cortex-pglite.json

# 2. Switch to Postgres
echo "CORTEX_DB_TYPE=postgres" >> ~/.cortex/.env

# 3. Migrate the schema in Postgres
cortex migrate

# 4. Re-ingest the export
# (cortex export currently produces a flat JSON of facts/entities/documents.
#  Re-ingestion is manual right now — paste high-importance facts via
#  cortex remember, or use cortex ingest on the source files.)
```

A first-class Postgres-import path is on the roadmap. For now, treat the switch as "fresh start in Postgres, keep the PGlite directory as a backup."

## Reverting to PGlite

If you decide Postgres isn't worth the operational overhead:

1. Remove or comment out `CORTEX_DB_TYPE=postgres` from `~/.cortex/.env`
2. Cortex defaults back to `~/.cortex/db/` (your old PGlite data is still there if you didn't delete it)
3. Stop the Postgres container or service if you want

## Troubleshooting

**`relation "fact" does not exist`** — you skipped `cortex migrate` after switching DB types. Run it.

**`extension "vector" is not available`** — pgvector isn't installed in your Postgres. See step 1.

**`permission denied for schema public`** — your Postgres user doesn't have CREATE rights. Add `GRANT ALL ON SCHEMA public TO cortex_app;` while connected to the cortex database.

**Connection refused** — Postgres isn't running, or the port/host in `.env` is wrong. `pg_isready -h localhost -p 5432` to confirm.

**Slow queries on large fact tables** — make sure pgvector's HNSW index was created. `\d fact` should show `fact_embedding_idx`. If missing, re-run `cortex migrate`.
