/**
 * Embedding ↔ database compatibility checks for onboarding / settings.
 *
 * The trap this prevents: pointing an embedder at a database whose vector
 * columns were built for a DIFFERENT dimension. pgvector columns are typed
 * `vector(N)`; inserting an M-dim vector (M≠N) throws at write time, so the
 * app looks configured but silently fails on every save. We detect the
 * mismatch UP FRONT — before writing config — and let the UI present the
 * user a choice (wipe & start fresh, or cancel), never a silent half-break.
 *
 *   inspectSchemaDims(conn)  → per-table embedding column dim + row counts
 *   diagnoseConflict({...})  → { conflict, currentDim, targetDim, rowsAtRisk }
 *
 * conn is a pg-shape connection object (from buildUrlConnection /
 * buildLocalConnection). We open a one-shot client and never touch the
 * daemon's pool — same posture as test-db-connection.js / ensure-pgvector.js.
 *
 *   ┌─ pick/switch embedding provider (target dim D) ─┐
 *   │  inspectSchemaDims(conn) → {fact: vector(C), …} │
 *   │  diagnoseConflict(D, schema)                     │
 *   │     C == D                → no conflict, proceed │
 *   │     C != D, rows == 0     → no conflict (alter)  │
 *   │     C != D, rows  > 0     → CONFLICT → ask user  │
 *   └──────────────────────────────────────────────────┘
 */
import pg from 'pg';

const EMBEDDING_TABLES = ['fact', 'chunk', 'entity', 'embedding_cache'];

/**
 * Read the embedding column type + populated-row count for each embedding
 * table. Returns a map keyed by table; tables that don't exist yet (fresh
 * DB) are omitted. Never throws on a missing table — only on a real
 * connection failure (so the caller can diagnoseError it).
 */
export async function inspectSchemaDims(conn) {
  const client = new pg.Client(conn);
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT c.relname AS tbl,
             a.atttypmod AS typmod,
             format_type(a.atttypid, a.atttypmod) AS coltype
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      WHERE a.attname = 'embedding'
        AND c.relkind = 'r'
        AND c.relname = ANY($1)
    `, [EMBEDDING_TABLES]);

    const schema = {};
    for (const r of rows) {
      // pgvector stores the dimension in atttypmod directly (no -4 offset).
      const dim = r.typmod > 0 ? r.typmod : dimFromColtype(r.coltype);
      let populated = 0;
      try {
        const { rows: cnt } = await client.query(
          `SELECT count(embedding)::int AS n FROM ${quoteIdent(r.tbl)}`,
        );
        populated = cnt[0].n;
      } catch { /* table without readable rows — treat as 0 */ }
      schema[r.tbl] = { dim, coltype: r.coltype, populated };
    }
    return schema;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

/**
 * Compare the target embedding dimension against the existing schema.
 * Conflict only when a column exists at a DIFFERENT dim AND holds rows —
 * an empty column can be altered freely, a matching dim is fine.
 */
export function diagnoseConflict({ targetDim, schema }) {
  let currentDim = null;
  const rowsAtRisk = {};
  let totalAtRisk = 0;

  for (const [tbl, info] of Object.entries(schema || {})) {
    if (info.dim == null) continue;
    if (currentDim == null) currentDim = info.dim;
    if (info.dim !== targetDim && info.populated > 0) {
      rowsAtRisk[tbl] = info.populated;
      totalAtRisk += info.populated;
    }
  }

  const conflict = currentDim != null && currentDim !== targetDim && totalAtRisk > 0;
  return { conflict, currentDim, targetDim, rowsAtRisk, totalAtRisk };
}

function dimFromColtype(coltype) {
  const m = /vector\((\d+)\)/i.exec(coltype || '');
  return m ? Number(m[1]) : null;
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`refusing to quote invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

export { EMBEDDING_TABLES };
