/**
 * Provider catalog — the single source of truth for the LLM and embedding
 * providers offered during onboarding (CLI `sigil init` AND the GUI wizard
 * AND GUI Settings). Each entry carries the GUI form-field schema (to capture
 * credentials) plus the `env` keys to write when chosen.
 *
 * The `id`s here MUST exist in the runtime registry (src/lib/llm/registry.js
 * PROVIDERS / EMBEDDERS) — enforced by test/provider-catalog.test.js so the
 * picker can never offer a provider the daemon can't load.
 *
 * Adding a provider to a picker = add one entry here; the CLI and GUI both
 * read it. (The runtime module under providers/ or embedders/ is separate.)
 */

export const LLM_PROVIDERS = [
  {
    id: 'claude-cli',
    label: 'Claude Code',
    hint: 'Uses your existing Claude Code subscription — no extra API key.',
    recommended: true,
    fields: [],
    env: { LLM_PROVIDER: 'claude-cli' },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'One API key for many models (Anthropic, OpenAI, Gemini, …). Cheapest default.',
    fields: [
      { name: 'OPENROUTER_API_KEY', label: 'OpenRouter API key', type: 'password', placeholder: 'sk-or-…' },
      { name: 'LLM_OPENROUTER_MODEL', label: 'Model (optional)', type: 'text', placeholder: 'google/gemini-flash-latest', optional: true },
    ],
    env: { LLM_PROVIDER: 'openrouter' },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Direct OpenAI access. Requires sk-… key with chat + embeddings.',
    fields: [
      { name: 'OPENAI_API_KEY', label: 'OpenAI API key', type: 'password', placeholder: 'sk-…' },
      { name: 'LLM_OPENAI_MODEL', label: 'Model (optional)', type: 'text', placeholder: 'gpt-4o-mini', optional: true },
    ],
    env: { LLM_PROVIDER: 'openai' },
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'Direct Anthropic API access.',
    fields: [
      { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', type: 'password', placeholder: 'sk-ant-…' },
    ],
    env: { LLM_PROVIDER: 'anthropic' },
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Local Ollama install. Free + private but slower on small machines.',
    fields: [
      { name: 'LLM_OLLAMA_HOST', label: 'Ollama host', type: 'text', placeholder: 'http://localhost:11434' },
      { name: 'LLM_OLLAMA_MODEL', label: 'Model', type: 'text', placeholder: 'qwen2.5:7b' },
    ],
    env: { LLM_PROVIDER: 'ollama' },
  },
];

export const EMBEDDING_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'text-embedding-3-large @ 1024 dimensions. Best out-of-the-box quality.',
    recommended: true,
    fields: [
      { name: 'OPENAI_API_KEY', label: 'OpenAI API key', type: 'password', placeholder: 'sk-…', sharedWith: 'llm' },
    ],
    env: {
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_MODEL: 'text-embedding-3-large',
      EMBEDDING_DIMENSIONS: '1024',
    },
  },
  {
    id: 'ollama',
    label: 'Ollama (mxbai-embed-large)',
    hint: '1024-dim local embeddings. Free, no key. Lower retrieval quality than OpenAI.',
    fields: [
      { name: 'OLLAMA_HOST', label: 'Ollama host', type: 'text', placeholder: 'http://localhost:11434' },
    ],
    env: {
      EMBEDDING_PROVIDER: 'ollama',
      // mxbai-embed-large emits 1024-dim — matches Sigil's fixed EMBEDDING_DIM.
      // nomic-embed-text (768-dim) is no longer compatible since the 1024 upgrade.
      EMBEDDING_MODEL: 'mxbai-embed-large',
      EMBEDDING_DIMENSIONS: '1024',
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'Uses OpenRouter as an embedding gateway. Reuses your LLM key.',
    fields: [
      { name: 'OPENROUTER_API_KEY', label: 'OpenRouter API key', type: 'password', placeholder: 'sk-or-…', sharedWith: 'llm' },
    ],
    env: {
      EMBEDDING_PROVIDER: 'openrouter',
      EMBEDDING_MODEL: 'openai/text-embedding-3-large',
      EMBEDDING_DIMENSIONS: '1024',
    },
  },
];

/**
 * Derived { id: { model, dimensions } } map for the CLI init picker, so the
 * model/dimension defaults can never drift from the GUI catalog.
 */
export const EMBEDDING_DEFAULTS = Object.fromEntries(
  EMBEDDING_PROVIDERS.map((p) => [p.id, {
    model: p.env.EMBEDDING_MODEL,
    dimensions: Number(p.env.EMBEDDING_DIMENSIONS),
  }]),
);
