/**
 * Ollama admin helpers for setup — list models, pull a model with streaming
 * progress, and probe reachability.
 *
 * Only embedding models that emit Sigil's fixed EMBEDDING_DIM (1024) are
 * offered. nomic-embed-text (768) and all-minilm (384) are deliberately NOT in
 * the list — picking them would fail the dimension check downstream. apply()
 * still probes the actual output dimension after a pull, so the curated list is
 * a convenience, not the sole guarantee.
 */

const DEFAULT_HOST = 'http://localhost:11434';

// Curated Ollama embedding models that produce 1024-dim vectors.
export const OLLAMA_EMBED_MODELS = [
  { name: 'mxbai-embed-large', dim: 1024, size: '~670MB', recommended: true },
  { name: 'bge-large', dim: 1024, size: '~670MB' },
  { name: 'bge-m3', dim: 1024, size: '~1.2GB' },
  { name: 'snowflake-arctic-embed2', dim: 1024, size: '~1.2GB' },
];

export const RECOMMENDED_EMBED_MODEL = OLLAMA_EMBED_MODELS.find((m) => m.recommended).name;

export async function isReachable(host = DEFAULT_HOST) {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Base names of installed models (strips the ":tag" suffix). */
export async function listInstalledModels(host = DEFAULT_HOST) {
  const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => String(m.name || '').split(':')[0]);
}

/**
 * The curated compatible models, each tagged with whether it's already pulled.
 * Recommended first. Never throws — an unreachable server just reports nothing
 * installed.
 */
export async function listCompatibleModels(host = DEFAULT_HOST) {
  let installed = [];
  try { installed = await listInstalledModels(host); } catch { /* server down */ }
  const set = new Set(installed);
  return OLLAMA_EMBED_MODELS.map((m) => ({ ...m, installed: set.has(m.name) }));
}

/**
 * Pull a model, streaming progress. onProgress({ status, percent }) is
 * best-effort (percent is null until Ollama reports byte totals). Resolves when
 * the pull completes; rejects on an Ollama-reported error.
 */
export async function pullModel(model, onProgress = () => {}, host = DEFAULT_HOST) {
  const res = await fetch(`${host}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama pull failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      if (j.error) throw new Error(j.error);
      const percent = j.total ? Math.round(((j.completed || 0) / j.total) * 100) : null;
      onProgress({ status: j.status || '', percent });
    }
  }
}
