// Drift guard: every provider the onboarding pickers offer MUST be loadable by
// the runtime registry. If someone adds a catalog entry without a matching
// providers/ or embedders/ module (or vice-versa renames one), this fails loud
// instead of the GUI offering a provider the daemon can't instantiate.

import { describe, it, expect } from 'vitest';

import { LLM_PROVIDERS, EMBEDDING_PROVIDERS, EMBEDDING_DEFAULTS } from './provider-catalog.js';

// The runtime loader maps (kept in sync intentionally; mirrored here rather
// than imported because registry.js does eager-ish dynamic imports on load).
const RUNTIME_LLM = ['openai', 'anthropic', 'openrouter', 'claude-cli', 'ollama'];
const RUNTIME_EMBED = ['ollama', 'openai', 'voyage', 'openrouter'];

describe('provider catalog', () => {
  it('every LLM provider id is loadable by the registry', () => {
    for (const p of LLM_PROVIDERS) {
      expect(RUNTIME_LLM, `catalog LLM "${p.id}" missing from registry PROVIDERS`).toContain(p.id);
    }
  });

  it('every embedding provider id is loadable by the registry', () => {
    for (const p of EMBEDDING_PROVIDERS) {
      expect(RUNTIME_EMBED, `catalog embedding "${p.id}" missing from registry EMBEDDERS`).toContain(p.id);
    }
  });

  it('every provider entry carries the env it will write', () => {
    for (const p of LLM_PROVIDERS) {
      expect(p.env.LLM_PROVIDER, `LLM "${p.id}" must set LLM_PROVIDER`).toBe(p.id);
    }
    for (const p of EMBEDDING_PROVIDERS) {
      expect(p.env.EMBEDDING_PROVIDER).toBe(p.id);
      expect(p.env.EMBEDDING_MODEL, `embedding "${p.id}" must set a model`).toBeTruthy();
      expect(Number(p.env.EMBEDDING_DIMENSIONS), `embedding "${p.id}" must set dimensions`).toBeGreaterThan(0);
    }
  });

  it('EMBEDDING_DEFAULTS is derived consistently from the catalog', () => {
    for (const p of EMBEDDING_PROVIDERS) {
      expect(EMBEDDING_DEFAULTS[p.id]).toEqual({
        model: p.env.EMBEDDING_MODEL,
        dimensions: Number(p.env.EMBEDDING_DIMENSIONS),
      });
    }
  });

  it('field schemas are well-formed (name + type)', () => {
    for (const p of [...LLM_PROVIDERS, ...EMBEDDING_PROVIDERS]) {
      for (const f of p.fields) {
        expect(f.name, `field in "${p.id}" needs a name`).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(['text', 'password']).toContain(f.type);
      }
    }
  });
});
