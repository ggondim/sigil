// Onboarding state-machine invariants. Pure logic + a tmp-file round-trip;
// never touches the real ~/.sigil/onboarding-state.json.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';

import {
  defaultState, advance, reconcile, loadState, saveState, legacyShape,
} from './state.js';
import { isComplete } from './steps.js';

const noProbe = async (env) => ({
  configured: Boolean(env.SIGIL_DATABASE_URL || env.SIGIL_DB_HOST),
  reachable: false, pgvector: false, migrationsRan: 0,
});
const readyProbe = async () => ({ configured: true, reachable: true, pgvector: true, migrationsRan: 12 });

describe('onboarding default + advance', () => {
  it('default state is IN_PROGRESS at the first step', () => {
    const s = defaultState();
    expect(s.status).toBe('IN_PROGRESS');
    expect(s.currentStep).toBe('CONNECTORS');
    expect(Object.keys(s.steps)).toEqual(['CONNECTORS', 'PROVIDER', 'EMBEDDING', 'DATABASE', 'FINISH']);
  });

  it('advance marks a step DONE and moves currentStep forward', () => {
    let s = defaultState();
    s = advance(s, { step: 'CONNECTORS', status: 'SKIPPED' });
    s = advance(s, { step: 'PROVIDER', status: 'DONE', data: { llmProvider: 'claude-cli' } });
    expect(s.steps.PROVIDER.status).toBe('DONE');
    expect(s.currentStep).toBe('EMBEDDING');
  });

  it('rejects an unknown step / status', () => {
    const s = defaultState();
    expect(() => advance(s, { step: 'NOPE', status: 'DONE' })).toThrow(/ONBOARDING_INVALID_TRANSITION|unknown onboarding step/);
    expect(() => advance(s, { step: 'PROVIDER', status: 'WAT' })).toThrow(/unknown step status/);
  });

  it('rejects DONE when the step invariant is not met', () => {
    const s = defaultState();
    // DATABASE requires pgvector + migrationsRan > 0
    expect(() => advance(s, { step: 'DATABASE', status: 'DONE', data: { pgvector: false } }))
      .toThrow(/invariant is not satisfied/);
    expect(() => advance(s, { step: 'PROVIDER', status: 'DONE', data: {} }))
      .toThrow(/invariant is not satisfied/);
  });

  it('rejects SKIP of a non-skippable step', () => {
    const s = defaultState();
    expect(() => advance(s, { step: 'PROVIDER', status: 'SKIPPED' })).toThrow(/not skippable/);
  });

  it('does not mutate the input state', () => {
    const s = defaultState();
    const snapshot = JSON.stringify(s);
    advance(s, { step: 'CONNECTORS', status: 'SKIPPED' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('reconcile', () => {
  it('converges a fully-configured env to COMPLETED', async () => {
    const env = {
      LLM_PROVIDER: 'claude-cli', EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_MODEL: 'text-embedding-3-large', EMBEDDING_DIMENSIONS: '1024',
      SIGIL_DATABASE_URL: 'postgres://x', SIGIL_SETUP_COMPLETE: 'true',
    };
    const s = await reconcile(defaultState(), { readEnv: () => env, probeDb: noProbe });
    expect(s.status).toBe('COMPLETED');
    expect(isComplete(s.steps)).toBe(true);
    // CONNECTORS auto-skipped, FINISH done under the legacy flag
    expect(s.steps.CONNECTORS.status).toBe('SKIPPED');
    expect(s.steps.FINISH.status).toBe('DONE');
  });

  it('a transient DB outage does NOT re-trigger onboarding for a finished install', async () => {
    const env = {
      LLM_PROVIDER: 'openrouter', EMBEDDING_PROVIDER: 'openai',
      SIGIL_DATABASE_URL: 'postgres://x', SIGIL_SETUP_COMPLETE: 'true',
    };
    // DB unreachable (the user's Neon-down scenario)
    const s = await reconcile(defaultState(), { readEnv: () => env, probeDb: noProbe });
    expect(s.status).toBe('COMPLETED');
    expect(s.steps.DATABASE.status).toBe('DONE');
  });

  it('without the legacy flag, DATABASE is DONE only when the probe satisfies the invariant', async () => {
    const env = { LLM_PROVIDER: 'claude-cli', EMBEDDING_PROVIDER: 'openai', SIGIL_DATABASE_URL: 'postgres://x' };
    const incomplete = await reconcile(defaultState(), { readEnv: () => env, probeDb: noProbe });
    expect(incomplete.steps.DATABASE.status).not.toBe('DONE');
    expect(incomplete.status).toBe('IN_PROGRESS');

    const complete = await reconcile(defaultState(), { readEnv: () => env, probeDb: readyProbe });
    expect(complete.steps.DATABASE.status).toBe('DONE');
    expect(complete.steps.DATABASE.data.migrationsRan).toBe(12);
  });
});

describe('load/save', () => {
  it('missing file → default; corrupt file → safe default', () => {
    const f = join(tmpdir(), `sigil-ob-${process.pid}-a.json`);
    rmSync(f, { force: true });
    expect(loadState(f).status).toBe('IN_PROGRESS');
    writeFileSync(f, '{ not json', 'utf8');
    expect(loadState(f).status).toBe('IN_PROGRESS');
    rmSync(f, { force: true });
  });

  it('atomic round-trip persists and reloads', () => {
    const f = join(tmpdir(), `sigil-ob-${process.pid}-b.json`);
    rmSync(f, { force: true });
    const s = advance(defaultState(), { step: 'CONNECTORS', status: 'SKIPPED' });
    saveState(s, f);
    expect(existsSync(f)).toBe(true);
    expect(JSON.parse(readFileSync(f, 'utf8')).steps.CONNECTORS.status).toBe('SKIPPED');
    expect(loadState(f).steps.CONNECTORS.status).toBe('SKIPPED');
    rmSync(f, { force: true });
  });
});

describe('legacyShape', () => {
  it('maps the machine to the old GUI wire shape', async () => {
    const env = { LLM_PROVIDER: 'claude-cli', EMBEDDING_PROVIDER: 'ollama', SIGIL_DATABASE_URL: 'postgres://x', SIGIL_SETUP_COMPLETE: 'true' };
    const s = await reconcile(defaultState(), { readEnv: () => env, probeDb: readyProbe });
    const legacy = legacyShape(s, env);
    expect(legacy.setupComplete).toBe(true);
    expect(legacy.steps.llm).toEqual({ done: true, provider: 'claude-cli' });
    expect(legacy.steps.embedding.done).toBe(true);
    expect(legacy.steps.database.done).toBe(true);
    expect(legacy.env.hasDatabaseUrl).toBe(true);
  });
});
