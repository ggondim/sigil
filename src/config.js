// Env-var precedence: SIGIL_* > CORTEX_* (legacy from pre-rename releases) > default.
// Existing 0.5.x users keep working without editing their .env; new users see only SIGIL_*.
const env = (key, legacyKey, fallback) =>
  process.env[key] ?? (legacyKey && process.env[legacyKey]) ?? fallback;

const config = {
  db: {
    // 'pglite' (default) — embedded, zero-install. 'postgres' — external Postgres via env vars.
    type: env('SIGIL_DB_TYPE', 'CORTEX_DB_TYPE', 'pglite'),
    host: env('SIGIL_DB_HOST', 'CORTEX_DB_HOST', 'localhost'),
    port: Number(env('SIGIL_DB_PORT', 'CORTEX_DB_PORT', 5432)),
    database: env('SIGIL_DB_NAME', 'CORTEX_DB_NAME', 'sigil'),
    user: env('SIGIL_DB_USER', 'CORTEX_DB_USER', 'sigil_app'),
    password: env('SIGIL_DB_PASSWORD', 'CORTEX_DB_PASSWORD', ''),
  },

  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || '',
    model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    voyageApiKey: process.env.VOYAGE_API_KEY || '',
  },

  llm: {
    provider: process.env.LLM_PROVIDER || '',

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.LLM_OPENAI_MODEL || 'gpt-4o-mini',

    // Ollama
    ollamaHost: process.env.LLM_OLLAMA_HOST || process.env.OLLAMA_HOST || 'http://localhost:11434',
    ollamaModel: process.env.LLM_OLLAMA_MODEL || 'qwen2.5:7b',

    // Claude CLI (dev — uses your Claude Code subscription)
    cliModel: process.env.LLM_CLI_MODEL || 'haiku',

    // Anthropic
    apiKey: process.env.ANTHROPIC_API_KEY || '',

    // Per-task model overrides (use provider-specific model names)
    extractionModel: process.env.LLM_EXTRACTION_MODEL || '',
    decisionModel: process.env.LLM_DECISION_MODEL || '',
    entityModel: process.env.LLM_ENTITY_MODEL || '',

    maxRetries: Number(process.env.LLM_MAX_RETRIES) || 3,
    cliTimeout: Number(process.env.LLM_CLI_TIMEOUT) || 120000,
  },

  output: {
    storage: process.env.OUTPUT_STORAGE || 'local',
    dir: process.env.OUTPUT_DIR || './output',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      publicUrl: process.env.S3_PUBLIC_URL || '',
    },
  },

  server: {
    port: Number(process.env.PORT) || 4000,
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  defaults: {
    namespace: process.env.DEFAULT_NAMESPACE || 'default',
  },

  memory: {
    // AUDM dedup: skip if similarity >= this (paraphrase of same fact)
    skipThreshold: Number(process.env.MEMORY_SKIP_THRESHOLD) || 0.88,
    // AUDM dedup: ask LLM if similarity >= this (possibly related).
    // 0.78 floor — measured during eval that 0.65 fired the LLM judge on
    // ~5x as many candidate pairs as actually warranted disambiguation.
    // Cuts ingest LLM cost by ~40% with no measurable quality drop.
    // Override per-deployment via MEMORY_AMBIGUOUS_THRESHOLD.
    ambiguousThreshold: Number(process.env.MEMORY_AMBIGUOUS_THRESHOLD) || 0.78,
    // Search: discard results below this cosine similarity floor
    minFactSimilarity: Number(process.env.MEMORY_MIN_FACT_SIMILARITY) || 0.45,
  },

  search: {
    // After hybrid retrieval, run an LLM pass over the top-K results to synthesize a coherent
    // answer that cites which items it used. Lifts hit@1 by ~9 points and gives the system a
    // natural way to refuse out-of-corpus queries ("Not in retrieved memory.") instead of
    // producing confidently-wrong answers from tangentially related facts.
    // Trade: +~$0.00015 and +~2.2s per search. Set SIGIL_SYNTHESIZE=false to disable.
    synthesize: env('SIGIL_SYNTHESIZE', 'CORTEX_SYNTHESIZE', 'true') !== 'false',
    // Model for the synthesis pass — defaults to LLM_EXTRACTION_MODEL.
    synthesizeModel: env('SIGIL_SYNTH_MODEL', 'CORTEX_SYNTH_MODEL', ''),
  },

  ingest: {
    // false → skip per-chunk fact extraction during ingest (Ogham-style lazy mode).
    // Trades ~17× cheaper writes for ~4 points of hit@1 on narrow queries.
    eagerExtract: env('SIGIL_EAGER_EXTRACT', 'CORTEX_EAGER_EXTRACT', 'true') !== 'false',
  },

  hebbian: {
    // Entity-level co-retrieval edges. Sibling of the fact-level signal, but
    // built over entities so it survives paraphrase + AUDM fact splits and
    // sharpens the existing graph traversal in search.
    entity: {
      enabled: env('SIGIL_HEBBIAN_ENTITY_ENABLED', null, 'true') !== 'false',
      // Per-event increment on co-retrieval.
      eta: Number(env('SIGIL_HEBBIAN_ENTITY_ETA', null, 1)),
      // Hard cap on stored strength — prevents hot pairs from dominating.
      cap: Number(env('SIGIL_HEBBIAN_ENTITY_CAP', null, 50)),
      // Lazy exponential decay applied on read.
      halfLifeDays: Number(env('SIGIL_HEBBIAN_ENTITY_HALF_LIFE_DAYS', null, 30)),
      // Minimum decayed strength to surface in getCoRetrievedEntities.
      minEffective: Number(env('SIGIL_HEBBIAN_ENTITY_MIN_EFFECTIVE', null, 0.5)),
      // Blend weight when adding co-retrieval as a third signal in rrfMerge.
      // The boost is normalized to [0,1] across the candidate set, then
      // multiplied by this weight and added to the candidate's RRF score.
      rrfWeight: Number(env('SIGIL_HEBBIAN_ENTITY_RRF_WEIGHT', null, 0.3)),
      // Max entities pulled from the top-K result set for write-side
      // strengthening. O(K²) writes, so kept small.
      maxWriteEntities: Number(env('SIGIL_HEBBIAN_ENTITY_MAX_WRITE', null, 12)),
      // When useGraph is on, pull up to this many co-retrieved neighbors per
      // seed entity to expand the related-fact search.
      expandPerSeed: Number(env('SIGIL_HEBBIAN_ENTITY_EXPAND_PER_SEED', null, 3)),
    },
  },
};

export default config;
