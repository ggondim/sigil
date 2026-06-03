import { chunk } from '../../collection.js';
import config from '../../../config.js';

const BATCH_SIZE = 50;

async function embedBatch(texts, { model, ollamaHost }) {
  const batches = chunk(texts, BATCH_SIZE);
  const allEmbeddings = [];

  for (const batch of batches) {
    const res = await fetch(`${ollamaHost}/api/embed`, {
      method: 'POST',
      // Local embedding — use the longer CLI budget, not the network timeout.
      signal: AbortSignal.timeout(config.llm.cliTimeout),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    allEmbeddings.push(...data.embeddings);
  }

  return allEmbeddings;
}

export { embedBatch };
