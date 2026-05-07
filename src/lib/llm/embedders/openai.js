async function embedBatch(texts, { model, openaiApiKey, dimensions } = {}) {
  // text-embedding-3-* support a `dimensions` parameter that truncates the output
  // via Matryoshka representation learning. Lets us match Sigil's vector(N) schema
  // (e.g. truncate text-embedding-3-large from native 3072d to 1024d for our DB)
  // without quality cliff.
  const body = { model, input: texts };
  if (dimensions && /^text-embedding-3/.test(model)) {
    body.dimensions = dimensions;
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

export { embedBatch };
