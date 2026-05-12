// PGlite-backed integration test for entity-Hebbian raw SQL.
//
// The mock-based tests in entity-hebbian.test.js verify orchestration but
// never run the queries against a real engine. That gap is how the
// `EXP(-? * EXTRACT...)` param-type bug (operator is not unique: - unknown)
// shipped in 0.9.0 — every search erred until 0.9.1 patched the casts.
//
// This file spins up an in-memory PGlite, creates the entity_hebbian_edge
// table with the same shape as the migration, seeds two edges, and exercises
// each raw-SQL function end-to-end. If a future change reintroduces an
// ambiguous parameter cast (EXP, INTERVAL, ANY(int[]), etc.), this test
// fails before the deploy.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import knex from 'knex';

import { ClientPGlite } from '../../db/pglite-adapter.js';

let pg;
let db;

beforeAll(async () => {
  // In-memory PGlite — no args means RAM only, isolated from the on-disk
  // singleton at ~/.sigil/db or any project-local PGlite directory.
  pg = new PGlite();
  await pg.waitReady;

  await pg.exec(`
    CREATE TABLE entity_hebbian_edge (
      entity_a_id BIGINT NOT NULL,
      entity_b_id BIGINT NOT NULL,
      strength    NUMERIC(12, 4) NOT NULL DEFAULT 1,
      first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_a_id, entity_b_id),
      CHECK (entity_a_id < entity_b_id)
    );
  `);

  await pg.exec(`
    INSERT INTO entity_hebbian_edge (entity_a_id, entity_b_id, strength, last_seen_at) VALUES
      (1, 2, 3.5, NOW() - INTERVAL '2 days'),
      (2, 3, 1.2, NOW() - INTERVAL '40 days');
  `);

  db = knex({
    client: ClientPGlite,
    connection: { pglitePath: '__inmemory__' },
    pool: { min: 1, max: 1 },
    wrapIdentifier: (value, origImpl) => origImpl(value.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)),
  });
  // Knex deep-clones the `connection` object — passing the PGlite instance
  // inside it trips lodash's clone on a non-cloneable WASM handle. Instead,
  // inject the instance directly onto the client after construction.
  db.client._injectedPglite = pg;

  vi.doMock('../../db/cortex.js', () => ({ default: db }));
  vi.doMock('../../config.js', () => ({
    default: {
      hebbian: {
        entity: {
          enabled: true,
          eta: 1,
          cap: 50,
          halfLifeDays: 30,
          minEffective: 0.0,
          rrfWeight: 0.3,
          maxWriteEntities: 12,
          expandPerSeed: 3,
        },
      },
    },
  }));
});

afterAll(async () => {
  if (db) await db.destroy();
  if (pg) await pg.close();
});

describe('entity-hebbian raw SQL (PGlite)', () => {
  it('strengthenEntityEdges runs the canonical-pair UPSERT without type errors', async () => {
    const { strengthenEntityEdges } = await import('./entity-hebbian.js');
    await expect(strengthenEntityEdges([5, 6, 7])).resolves.toBeUndefined();

    const { rows } = await pg.query('SELECT entity_a_id, entity_b_id FROM entity_hebbian_edge WHERE entity_a_id >= 5 ORDER BY entity_a_id, entity_b_id');
    expect(rows.map((r) => [Number(r.entity_a_id), Number(r.entity_b_id)])).toEqual([
      [5, 6],
      [5, 7],
      [6, 7],
    ]);
  });

  it('getCoRetrievedEntities applies decay without `operator is not unique` errors', async () => {
    const { getCoRetrievedEntities } = await import('./entity-hebbian.js');
    const partners = await getCoRetrievedEntities(1, { limit: 5 });
    expect(partners).toHaveLength(1);
    expect(Number(partners[0].partnerId)).toBe(2);
    // strength=3.5, halfLife=30, age≈2d → effective ≈ 3.5 * exp(-ln2/30 * 2) ≈ 3.34
    expect(partners[0].effectiveStrength).toBeGreaterThan(3);
    expect(partners[0].effectiveStrength).toBeLessThan(3.5);
  });

  it('getEdgeStrengthsForRanking decays + groups correctly across seed/candidate sets', async () => {
    const { getEdgeStrengthsForRanking } = await import('./entity-hebbian.js');
    const map = await getEdgeStrengthsForRanking([1], [2, 3]);
    expect(map.size).toBe(1);
    expect(map.has(2)).toBe(true);
    expect(map.get(2)).toBeGreaterThan(3);
  });

  it('consolidateEntityCoRetrievalEdges deletes edges below floor without param-type errors', async () => {
    const { consolidateEntityCoRetrievalEdges } = await import('./entity-hebbian.js');
    // The (2,3) edge: strength=1.2, last_seen=40d ago, halfLife=30 → effective ≈ 1.2 * exp(-ln2/30 * 40) ≈ 0.477.
    // floor=0.5, decayDays=30 → both conditions hit, edge deleted.
    const deleted = await consolidateEntityCoRetrievalEdges({ floor: 0.5, decayDays: 30 });
    expect(deleted).toBe(1);
    const { rows } = await pg.query('SELECT 1 FROM entity_hebbian_edge WHERE entity_a_id = 2 AND entity_b_id = 3');
    expect(rows).toHaveLength(0);
  });
});
