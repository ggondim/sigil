# Audit: LLM + Embedding Provider System & Config Layer

**Date:** 2026-05-19  
**Scope:** `src/config.js`, `src/lib/llm/registry.js`, provider & embedder files, `src/lib/config-validator.js`, `src/lib/llm.js`

---

## Executive Summary

The provider system is **well-structured but suffers from three fixable problems**: (1) repeated boilerplate across 5 provider files, (2) provider-specific config scattered across `config.js` instead of grouped by provider, (3) config field names duplicated across `registry.js`, `config-validator.js`, and individual providers with no single source of truth.

**Adding a new provider requires touching 2 files** (provider + registry), but **extracting shared boilerplate could cut provider files by 70%** and make the system auto-pluggable.

---

## 1. Config Structure Issues

### Current State: `src/config.js` (147 lines)

| Issue | Severity | Details |
|-------|----------|---------|
| **Scattered provider keys** | High | `config.llm.openaiApiKey` (line 30), `config.llm.anthropic.apiKey` (line 41), `config.llm.openrouterApiKey` (line 50). Field naming is inconsistent: `openaiApiKey` vs `apiKey` vs `openrouterApiKey`. |
| **Duplicate env-var keys** | High | `OPENAI_API_KEY` read twice: once for LLM (line 30), once for embedding (line 22). This is intentional (shared key) but fragile — changing one breaks the other silently. |
| **Embedding config split** | Medium | LLM and embedding share `ollamaHost` and `openaiApiKey`, but are stored in different config subtrees (`config.llm.*` vs `config.embedding.*`). No clear ownership. |
| **Magic env-var names everywhere** | Medium | `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `EMBEDDING_PROVIDER` are hardcoded string literals in 3+ files (registry.js, providers, config-validator.js). No central mapping. |
| **Bloated OpenRouter comment** | Low | Lines 43–54: 12-line comment that narrates WHAT the config does (gateway, one key, models namespaced). Should be a link to docs. |

### Recommendation: Provider Config Registry

Create a single provider manifest instead of scattering fields:

```javascript
// src/lib/llm/provider-config.js
const PROVIDER_REGISTRY = {
  openai: {
    env: { apiKey: 'OPENAI_API_KEY', model: 'LLM_OPENAI_MODEL' },
    defaults: { model: 'gpt-4o-mini' },
  },
  anthropic: {
    env: { apiKey: 'ANTHROPIC_API_KEY', model: 'LLM_ANTHROPIC_MODEL' },
    defaults: { model: 'claude-haiku-4-5-20251001' },
  },
  // ... etc
};
```

This eliminates duplication in registry.js (lines 108–110) and config-validator.js (lines 42–52).

---

## 2. Provider Files: Duplicate Boilerplate

### Pattern Analysis

| File | Lines | Boilerplate | Issue |
|------|-------|-------------|-------|
| `openai.js` | 41 | `fetch` → `response.ok?` → `data.choices[0].message.content` | Generic REST shape |
| `openrouter.js` | 74 | Same fetch+parse, +header assembly | Generic REST shape + optional headers |
| `ollama.js` | 37 | `fetch('/api/chat')` + parse | Generic REST shape |
| `anthropic.js` | 36 | SDK import + client init | SDK-specific, less code |
| `claude-cli.js` | 93 | Process spawn + JSON parsing + timeout | CLI-specific, unavoidable |

### Duplicated Code Example

**openai.js (lines 14–31):**
```javascript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify(body),
});
if (!response.ok) throw new Error(`OpenAI error ${response.status}: ...`);
const data = await response.json();
const text = data.choices[0].message.content.trim();
```

**openrouter.js (lines 47–63):** Identical, except base URL and optional headers.  
**ollama.js (lines 15–26):** Identical.

### Recommendation: OpenAI-Compatible Factory

```javascript
// src/lib/llm/providers/openai-compatible.js
async function createOpenAICompatibleProvider({
  baseUrl, apiKey, headersFn = () => ({})
}) {
  return async (input, { model, jsonMode = false } = {}) => {
    const messages = [{ role: 'user', content: input }];
    if (jsonMode && !input.includes('json')) {
      messages.unshift({ role: 'system', content: 'Respond with valid JSON.' });
    }
    const body = { model, messages };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headersFn(),
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`API error ${response.status}: ...`);
    const data = await response.json();
    return {
      text: data.choices[0].message.content.trim(),
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      model: data.model || model,
    };
  };
}
```

Then:
- **openai.js** becomes 5 lines:
  ```javascript
  import { createOpenAICompatibleProvider } from './openai-compatible.js';
  const chat = await createOpenAICompatibleProvider({
    baseUrl: 'https://api.openai.com/v1', apiKey: config.llm.openaiApiKey
  });
  export { chat };
  ```
- **openrouter.js** becomes 10 lines (adds headersFn for referer + title).
- **ollama.js** would need custom formatting (expects `format: 'json'` not `response_format`), so it stays standalone.

**Impact:** 3 provider files shrink from ~40 lines → ~5–10 lines. Easier to maintain, reduces fetch-parse code duplication by 70%.

---

## 3. Embedder Files: Same Boilerplate, Different Providers

### Pattern: Three fetch-based embedders (openai.js, ollama.js, voyage.js)

| File | Lines | Pattern | Issue |
|------|-------|---------|-------|
| `openai.js` | 27 | `fetch('https://api.openai.com/v1/embeddings')` + parse | Generic REST |
| `voyage.js` | 65 | Loop + batching + `fetch('https://api.voyageai.com/v1/embeddings')` + parse | Generic REST + batch logic |
| `ollama.js` | 25 | Loop + batching + `fetch('${host}/api/embed')` | Generic REST + batch logic |

All three share:
- Batch management (break into 50-sized chunks, loop, accumulate results)
- Same error handling pattern
- Same response.ok check + JSON parse

### Recommendation: Generic Embedder Factory

```javascript
// src/lib/llm/embedders/fetch-embedder.js
async function createFetchEmbedder({ baseUrl, apiKey, batchSize = 50, transformBody, transformResult }) {
  return async (texts, opts = {}) => {
    const batches = chunk(texts, batchSize);
    const allEmbeddings = [];
    for (const batch of batches) {
      const body = transformBody(batch, opts);
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey && { Authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Embed failed: ${response.status}`);
      const data = await response.json();
      allEmbeddings.push(...transformResult(data));
    }
    return allEmbeddings;
  };
}
```

Then:
- **openai.js** becomes ~8 lines (just set up the factory).
- **voyage.js** becomes ~15 lines (adds dimension truncation + sorting logic).
- **ollama.js** stays ~15 lines (custom endpoint path + different response shape).

**Impact:** Reduces boilerplate by 40–50%, centralizes batching & error handling.

---

## 4. Registry Pluggability

### Current: `src/lib/llm/registry.js` (152 lines)

**Strengths:**
- Lazy loading via dynamic import functions (lines 7–19). Good.
- Provider/model resolution is clean (lines 46–59).
- Cache pattern works well (lines 21–42).

**Gaps:**
- `detectProvider()` and `detectEmbeddingProvider()` are hard-coded priority sequences (lines 85–134). Adding a new provider requires editing the function.
- No way to register custom providers at runtime (e.g., user-supplied provider for internal API).
- Provider names must be added to both `PROVIDERS` map (line 7) and detectProvider logic (lines 98–104).

### To Add a New Provider Today

1. Create `src/lib/llm/providers/myProvider.js`
2. Add to `PROVIDERS` object in registry.js (line 7)
3. Add detection logic in `detectProvider()` if you want auto-detection (line 85+)
4. Add env-var mappings to config-validator.js (lines 42–46)
5. Add case to envNameFor() in config-validator.js (lines 161–169)

**Answer: 3 files, 5 edits.**

### Recommendation: Pluggable Provider Registration

```javascript
// registry.js: export a registration function
const PROVIDER_PLUGINS = {};

export function registerProvider(name, loader, detectFn) {
  PROVIDER_PLUGINS[name] = { loader, detectFn };
}

export async function detectProvider() {
  // Check config first
  if (config.llm.provider) return config.llm.provider;
  
  // Run all registered detectors in priority order
  for (const [name, { detectFn }] of Object.entries(PROVIDER_PLUGINS)) {
    if (await detectFn()) return name;
  }
  throw new Error(...);
}
```

Then at startup: `registerProvider('openai', () => import(...), () => !!config.llm.openaiApiKey)`.

**Impact:** New providers can be registered without touching registry.js. Testable. Extensible.

---

## 5. Config Validator: Regex-Based, Hardcoded

### Current: `src/lib/config-validator.js` (180 lines)

**Strengths:**
- Clear error messages with fix suggestions (lines 96–114).
- Catches provider/model mismatches (the bug that caused 161 failures).

**Gaps:**
- `EMBEDDING_MODEL_PATTERNS` (lines 29–40) is hardcoded regex. New embedder models require editing the file.
- Key mappings (lines 42–52) duplicated from config.js field names. No single source.
- `envNameFor()` (lines 161–169) is a manual switch statement. Adding a provider means adding 2 more cases.

### To Add Provider `myProvider` with Model `my-model-v1`

1. Add regex pattern to `EMBEDDING_MODEL_PATTERNS` (if embedder).
2. Add entry to `EMBEDDING_KEY_BY_PROVIDER` or `LLM_KEY_BY_PROVIDER` (lines 48–52).
3. Add case to `envNameFor()` (lines 163–168).

**Answer: 3 edits in one file, but brittle.**

### Recommendation: Drive Validation from Provider Registry

```javascript
// Merge config-validator.js logic into provider-config.js
const PROVIDERS = {
  openai: {
    env: { apiKey: 'OPENAI_API_KEY', ... },
    modelPatterns: [/^gpt-/],
    requiresKey: true,
  },
  // ...
};

export function validateConfig() {
  for (const [provider, spec] of Object.entries(PROVIDERS)) {
    if (config.llm.provider === provider && !config.llm[spec.env.apiKey]) {
      issues.push({ ... });
    }
  }
  // ...
}
```

**Impact:** One source of truth for provider metadata. Validation auto-extends when you add a provider.

---

## 6. Dead Code & Import Hygiene

| Issue | Severity | Details |
|--------|----------|---------|
| **Unused comment blocks** | Low | `llm.js` lines 5–6: "Resolve which provider...". `openrouter.js` lines 1–14: 14 lines explaining WHAT (provider gateway, one key, many models). Should be doclinks. |
| **Bundled imports** | Low | `config-validator.js` imports 1 item from 1 module. Could be clubbed with adjacent import of cortexDb (none present, but pattern applies). |
| **Mixed import/dynamic** | Low | `llm.js` uses static `import` for config + registry, but registry uses dynamic `import()`. Consistent. No issue. |
| **estimateTokens exported but rarely used** | Low | Exported from log.js but only used in 2 providers. Could be inlined. |

---

## 7. Coupling Issues: Config Knowledge Leaking

| Pattern | Severity | Impact |
|---------|----------|--------|
| Each provider hardcodes its config keys | High | openai.js:18 `config.llm.openaiApiKey`, llama.js:5 `config.llm.ollamaHost`. Change a key name in config.js? You edit 5 files. |
| registry.js knowsabout specific config fields | Medium | Lines 98–104 reference `config.llm.openrouterApiKey`, `config.llm.apiKey`, etc. directly. |
| config-validator.js mirrors key names | Medium | Lines 42–52 hardcode `'openaiApiKey'`, `'apiKey'`. Same strings exist in config.js and providers. |
| Magic env-var names spread across files | Medium | `'OPENAI_API_KEY'` appears in config.js, cli.js, config-validator.js, registry.js. Change name = 4+ edits. |

### Single Fix: Provider Config Manifest

```javascript
// src/lib/llm/provider-config.js
export const PROVIDER_MANIFESTS = {
  openai: {
    label: 'OpenAI',
    env: { apiKey: 'OPENAI_API_KEY', model: 'LLM_OPENAI_MODEL' },
    configPath: 'llm.openaiApiKey',
    defaults: { model: 'gpt-4o-mini' },
    models: [/^gpt-/],
  },
  anthropic: {
    label: 'Anthropic',
    env: { apiKey: 'ANTHROPIC_API_KEY', model: 'LLM_ANTHROPIC_MODEL' },
    configPath: 'llm.apiKey',
    defaults: { model: 'claude-haiku-4-5-20251001' },
  },
  // ... etc
};
```

Then:
- **registry.js** reads detectProvider priority from manifest.
- **config-validator.js** auto-validates all keys from manifest (no hardcoded switch).
- **New provider**: 1 entry in manifest, auto-plugs everywhere.

---

## 8. Key Findings Summary

| Category | Finding | Effort | Priority |
|----------|---------|--------|----------|
| **Boilerplate** | 3 LLM providers + 3 embedders share 70% fetch code | M | HIGH |
| **Duplication** | Provider keys, env-var names, model patterns hardcoded 3+ places | M | HIGH |
| **Pluggability** | Adding provider = 3 files, no auto-discovery registration | L | MEDIUM |
| **Config structure** | Provider config scattered across `llm` and `embedding` subtrees | L | LOW |
| **Comments** | 12 lines of explanatory comments in openrouter.js (WHAT, not WHY) | XS | LOW |

---

## Recommendations (Prioritized)

### Phase 1: Extract Boilerplate (2–3h)
1. Create `src/lib/llm/providers/openai-compatible.js` factory
2. Refactor `openai.js`, `openrouter.js`, `ollama.js` to use it (70% less code)
3. Create `src/lib/llm/embedders/fetch-embedder.js` factory
4. Refactor `openai.js`, `voyage.js`, `ollama.js` embedders

### Phase 2: Single Source of Truth (2–3h)
1. Create `src/lib/llm/provider-config.js` with `PROVIDER_MANIFESTS`
2. Refactor `registry.js` detectProvider() to use manifest
3. Refactor `config-validator.js` to auto-validate from manifest
4. Remove hardcoded switches from envNameFor()

### Phase 3: Runtime Registration (1h)
1. Add `registerProvider()` export to registry.js
2. Update tests to use registration pattern

---

## Files Modified Summary

| File | Change | Lines |
|------|--------|-------|
| `openai.js` | Use factory | 41 → 10 |
| `openrouter.js` | Use factory | 74 → 12 |
| `ollama.js` | Use factory | 37 → 10 |
| `openai-compatible.js` | NEW (factory) | 35 |
| `fetch-embedder.js` | NEW (factory) | 30 |
| `provider-config.js` | NEW (manifest) | 40 |
| `registry.js` | Plug in manifest, add registerProvider | 152 → 110 |
| `config-validator.js` | Consume manifest | 180 → 120 |
| `config.js` | Unaffected | 147 |
| `llm.js` | Unaffected | 93 |

**Net:** ~150 lines of boilerplate removed, 1 source of truth added.

---

## Conclusion

The provider system is **functionally sound** but exhibits **classical copy-paste accumulation**. The three fixes above are orthogonal and each yields measurable benefits:

1. **Boilerplate elimination** → easier code review, faster provider onboarding, fewer fetch-edge-case bugs
2. **Config manifest** → one source of truth, eliminates 3+ hardcoded switches, validator auto-plugs
3. **Runtime registration** → testable, extensible, no registry.js edits for custom providers

All changes are **backward compatible** — the public API (`getProvider`, `detectProvider`, `prompt`, `promptJson`) does not change.

