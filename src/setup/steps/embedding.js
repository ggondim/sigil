/**
 * Setup step: Embeddings.
 *
 * Every provider is PINNED to a model that produces Sigil's fixed dimension
 * (EMBEDDING_DIM = 1024) — no free-text model field, so the "model not
 * supported" / dimension-mismatch failure class can't happen. apply() writes
 * the provider + pinned model + key, then runs a cache-bypassed embed and
 * asserts the vector length is exactly 1024.
 */
import { patchConfig, getConfig } from '../config-store.js';
import { StepError } from '../errors.js';
import { EMBEDDING_DIM } from '../../lib/constants.js';

// `model` is fixed per provider. `shared` means the key can be reused from the
// LLM step when that step picked the same provider.
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', hint: 'text-embedding-3-large @ 1024 — best out-of-the-box quality', recommended: true, model: 'text-embedding-3-large', keyed: true, shared: true },
  { id: 'voyage', label: 'Voyage', hint: 'voyage-3 @ 1024', model: 'voyage-3', keyed: true, shared: false },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Gateway; reuses your LLM key', model: 'openai/text-embedding-3-large', keyed: true, shared: true },
  { id: 'ollama', label: 'Ollama (mxbai-embed-large)', hint: '1024-dim local embeddings, free', model: 'mxbai-embed-large', keyed: false, shared: false },
];

export const id = 'embedding';
export const title = 'Embeddings';

export function listProviders() {
  // Tell the UI whether a shared key already exists so it can hide the field.
  const cfg = getConfig();
  return PROVIDERS.map((p) => ({
    ...p,
    sharedKeyAvailable: p.shared && cfg.llm.provider === p.id && Boolean(cfg.llm.apiKey),
  }));
}

export function detect() { return { providers: listProviders() }; }

/** The key to use: explicit input, else the LLM step's key if same provider. */
function resolveKey(p, input) {
  if (input.apiKey) return input.apiKey;
  if (p.shared) {
    const cfg = getConfig();
    if (cfg.llm.provider === p.id && cfg.llm.apiKey) return cfg.llm.apiKey;
  }
  return null;
}

export function validate(input = {}) {
  const errors = {};
  const p = PROVIDERS.find((x) => x.id === input.provider);
  if (!p) errors.provider = 'choose a provider';
  else if (p.keyed && !resolveKey(p, input)) errors.apiKey = 'an API key is required';
  return { ok: Object.keys(errors).length === 0, errors };
}

export async function apply(input, emit = () => {}) {
  const p = PROVIDERS.find((x) => x.id === input.provider);
  if (!p) throw new StepError({ message: `Unknown embedding provider: ${input.provider}`, kind: 'other' });

  emit({ pct: 20, label: 'Saving provider…' });
  patchConfig('embedding', {
    provider: p.id,
    model: p.model, // pinned
    apiKey: resolveKey(p, input),
    host: input.host || null,
  });

  emit({ pct: 55, label: 'Testing embed call…' });
  try {
    const { resetDetection } = await import('../../lib/llm/registry.js');
    resetDetection();
    const { embed } = await import('../../ingestion/embedder.js');
    // cache:false — don't touch the Postgres embedding cache; this just probes
    // the provider. Verify the model emits exactly our fixed dimension.
    const v = await embed('Sigil setup embedding test', { cache: false });
    if (!Array.isArray(v) || v.length === 0) {
      throw new StepError({ message: 'The embedder returned an empty vector.', kind: 'other' });
    }
    if (v.length !== EMBEDDING_DIM) {
      throw new StepError({
        message: `This model returned ${v.length}-dim vectors, but Sigil requires ${EMBEDDING_DIM}.`,
        hint: `Pick a provider/model that produces ${EMBEDDING_DIM}-dim embeddings.`,
        kind: 'model-not-found',
      });
    }
    emit({ pct: 100, label: 'Embedder ready.' });
    return { provider: p.id, model: p.model, dim: v.length };
  } catch (err) {
    if (err instanceof StepError) throw err;
    // Classify provider/key/model failures honestly.
    const { diagnoseError } = await import('../../db/setup.js');
    const d = diagnoseError(err);
    throw new StepError({ message: d.humanMessage, hint: d.fixHint, kind: d.kind });
  }
}

export default { id, title, detect, listProviders, validate, apply };
