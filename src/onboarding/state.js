/**
 * Onboarding state machine — explicit, persisted, guarded.
 *
 * The wizard's progress lives in ~/.sigil/onboarding-state.json (the DB does
 * not exist during onboarding, so state cannot live there). This module is the
 * single owner of that file:
 *
 *   loadState()  — read (safe default on missing/corrupt)
 *   saveState()  — atomic write (temp + rename)
 *   advance()    — apply a guarded transition (throws on illegal ones)
 *   reconcile()  — fold ground truth (env + DB probe) so a hand-edited .env or
 *                  a pre-existing install converges. Honors the legacy
 *                  SIGIL_SETUP_COMPLETE flag as authoritative for "done before".
 *
 * Status enum / step order live in ./steps.js.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

import { SIGIL_ONBOARDING_STATE } from '../lib/paths.js';
import { readEnvRaw } from '../lib/env-file.js';
import { AppError } from '../lib/errors.js';
import {
  STEPS, STEP_IDS, STEP_BY_ID, STEP_STATUS, isComplete, firstOpenStep,
} from './steps.js';

const VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

export function defaultState() {
  const steps = {};
  for (const id of STEP_IDS) steps[id] = { status: STEP_STATUS.PENDING, error: null, data: {} };
  const ts = nowIso();
  return { version: VERSION, status: 'IN_PROGRESS', currentStep: STEP_IDS[0], startedAt: ts, updatedAt: ts, steps };
}

export function loadState(file = SIGIL_ONBOARDING_STATE) {
  try {
    if (!existsSync(file)) return defaultState();
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION || !raw.steps) {
      return defaultState();
    }
    // Merge over a fresh default so a newly-added step can't be missing.
    const base = defaultState();
    const steps = { ...base.steps };
    for (const id of STEP_IDS) {
      if (raw.steps[id]) steps[id] = { status: STEP_STATUS.PENDING, error: null, data: {}, ...raw.steps[id] };
    }
    return { ...base, ...raw, steps };
  } catch {
    return defaultState();
  }
}

export function saveState(state, file = SIGIL_ONBOARDING_STATE) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, file);
  return state;
}

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

function recompute(state) {
  if (isComplete(state.steps)) {
    state.status = 'COMPLETED';
    state.currentStep = 'FINISH';
  } else {
    state.status = 'IN_PROGRESS';
    state.currentStep = firstOpenStep(state.steps);
  }
}

/**
 * Apply a guarded transition. Throws AppError(ONBOARDING_INVALID_TRANSITION) on
 * an unknown step/status, a DONE that fails the step invariant, or a SKIP of a
 * non-skippable step. Returns a NEW state (does not mutate the input).
 */
export function advance(state, { step, status, data, error } = {}) {
  const def = STEP_BY_ID[step];
  if (!def) throw new AppError({ errorCode: 'ONBOARDING_INVALID_TRANSITION', message: `unknown onboarding step: ${step}` });
  if (!STEP_STATUS[status]) throw new AppError({ errorCode: 'ONBOARDING_INVALID_TRANSITION', message: `unknown step status: ${status}` });

  const next = clone(state);
  const cur = next.steps[step];
  const mergedData = { ...(cur.data || {}), ...(data || {}) };

  if (status === STEP_STATUS.DONE && !def.validate(mergedData)) {
    throw new AppError({
      errorCode: 'ONBOARDING_INVALID_TRANSITION',
      message: `step ${step} cannot be marked DONE: its invariant is not satisfied`,
      data: { step, data: mergedData },
    });
  }
  if (status === STEP_STATUS.SKIPPED && !def.skippable) {
    throw new AppError({ errorCode: 'ONBOARDING_INVALID_TRANSITION', message: `step ${step} is not skippable` });
  }

  next.steps[step] = { status, error: error || null, data: mergedData };
  recompute(next);
  next.updatedAt = nowIso();
  return next;
}

/** Default DB prober — best-effort, never throws. Overridable for tests. */
async function defaultProbeDb(env) {
  const out = { configured: Boolean(env.SIGIL_DATABASE_URL || env.SIGIL_DB_HOST), reachable: false, pgvector: false, migrationsRan: 0 };
  if (!out.configured) return out;
  try {
    const { default: cortexDb } = await import('../db/cortex.js');
    await cortexDb.raw('SELECT 1');
    out.reachable = true;
    const ext = await cortexDb.raw("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    out.pgvector = ext.rows.length > 0;
    const [m] = await cortexDb('knex_migrations').count('* as n').catch(() => [{ n: 0 }]);
    out.migrationsRan = Number(m?.n ?? 0);
  } catch { /* unreachable / not migrated — leave defaults */ }
  return out;
}

/**
 * Fold ground truth into the persisted state. Upgrades steps to DONE when the
 * environment/DB actually satisfies them; never downgrades a DONE. When the
 * legacy SIGIL_SETUP_COMPLETE flag is set it is treated as authoritative — a
 * transient DB outage must NOT re-trigger onboarding for an install that
 * already finished.
 */
export async function reconcile(state, { readEnv = readEnvRaw, probeDb = defaultProbeDb } = {}) {
  const env = readEnv();
  const next = clone(state);
  const legacyComplete = env.SIGIL_SETUP_COMPLETE === 'true';

  const set = (id, status, data) => {
    const cur = next.steps[id];
    next.steps[id] = {
      status,
      error: status === STEP_STATUS.ERROR ? cur.error : null,
      data: { ...(cur.data || {}), ...(data || {}) },
    };
  };
  const keepDone = (id) => next.steps[id].status === STEP_STATUS.DONE;

  // Provider / embedding: env presence is ground truth.
  if (env.LLM_PROVIDER) set('PROVIDER', STEP_STATUS.DONE, { llmProvider: env.LLM_PROVIDER });
  if (env.EMBEDDING_PROVIDER) {
    set('EMBEDDING', STEP_STATUS.DONE, {
      provider: env.EMBEDDING_PROVIDER,
      model: env.EMBEDDING_MODEL || null,
      dim: env.EMBEDDING_DIMENSIONS || null,
    });
  }

  // Database: probe (best-effort). Refresh data always; only mark DONE when the
  // invariant is actually met (or never downgrade an existing DONE).
  const probe = await probeDb(env);
  const dbData = {
    configured: probe.configured,
    mode: env.SIGIL_DATABASE_URL ? 'url' : (env.SIGIL_DB_HOST ? 'fields' : null),
    reachable: probe.reachable,
    pgvector: probe.pgvector,
    migrationsRan: probe.migrationsRan,
  };
  const dbReady = probe.configured && probe.pgvector && probe.migrationsRan > 0;
  set('DATABASE', dbReady || keepDone('DATABASE') ? STEP_STATUS.DONE : next.steps.DATABASE.status, dbData);

  // Legacy completion flag is authoritative — trust a prior finished setup.
  if (legacyComplete) {
    if (env.LLM_PROVIDER) set('PROVIDER', STEP_STATUS.DONE, {});
    if (env.EMBEDDING_PROVIDER) set('EMBEDDING', STEP_STATUS.DONE, {});
    if (probe.configured) set('DATABASE', STEP_STATUS.DONE, {});
    if (next.steps.CONNECTORS.status === STEP_STATUS.PENDING) set('CONNECTORS', STEP_STATUS.SKIPPED, {});
    set('FINISH', STEP_STATUS.DONE, {});
  }

  recompute(next);
  next.updatedAt = nowIso();
  return next;
}

/**
 * Legacy wire shape for the currently-shipped GUI (app.js reads
 * `data.setupComplete` and `data.steps.{database,llm,embedding}.done`). Returned
 * alongside the new machine by the onboardingState RPC during rollout.
 */
export function legacyShape(state, env = readEnvRaw()) {
  const s = state.steps;
  return {
    setupComplete: state.status === 'COMPLETED',
    env: {
      llmProvider: env.LLM_PROVIDER || null,
      embeddingProvider: env.EMBEDDING_PROVIDER || null,
      embeddingModel: env.EMBEDDING_MODEL || null,
      embeddingDim: env.EMBEDDING_DIMENSIONS || null,
      hasDatabaseUrl: Boolean(env.SIGIL_DATABASE_URL),
      hasDiscreteDb: Boolean(env.SIGIL_DB_HOST),
    },
    steps: {
      database: {
        done: s.DATABASE.status === STEP_STATUS.DONE,
        configured: Boolean(s.DATABASE.data?.configured),
        pgvector: Boolean(s.DATABASE.data?.pgvector),
        migrationsRan: Number(s.DATABASE.data?.migrationsRan || 0),
      },
      llm: { done: s.PROVIDER.status === STEP_STATUS.DONE, provider: s.PROVIDER.data?.llmProvider || null },
      embedding: { done: s.EMBEDDING.status === STEP_STATUS.DONE, provider: s.EMBEDDING.data?.provider || null },
    },
  };
}
