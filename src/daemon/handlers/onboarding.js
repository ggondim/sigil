/**
 * Onboarding state for the GUI-first first-run wizard.
 *
 * The wizard needs to know:
 *   1. Has the user finished setup before?  (SETUP_COMPLETE flag)
 *   2. What DB are they on, and does it have pgvector + migrations?
 *   3. Which LLM and embedding providers does the user have configured?
 *   4. What client integrations (Claude Code, Cursor, …) are detected?
 *
 * All RPC methods here are LOCAL_ONLY by design — even on a
 * lite-follower the wizard runs on *this* device.
 */
import { readEnvRaw, writeEnvKeys } from '../../lib/env-file.js';
// Provider field schemas live in one catalog shared by the CLI init flow and
// the GUI wizard/settings — see src/lib/llm/provider-catalog.js.
import { LLM_PROVIDERS, EMBEDDING_PROVIDERS } from '../../lib/llm/provider-catalog.js';
// Explicit, persisted onboarding state machine — see src/onboarding/state.js.
import { loadState, saveState, advance, reconcile, defaultState, legacyShape } from '../../onboarding/state.js';

export function registerOnboarding(registry) {
  // Returns the persisted onboarding machine, reconciled against ground truth
  // (env + DB probe). Also returns the LEGACY top-level shape the currently
  // shipped GUI reads (data.setupComplete, data.steps.{database,llm,embedding});
  // the new GUI reads `data.machine`. Persists only when reconcile changed it.
  registry.register('onboardingState', async () => {
    const loaded = loadState();
    const before = JSON.stringify(loaded);
    const machine = await reconcile(loaded);
    if (JSON.stringify(machine) !== before) saveState(machine);
    return { ...legacyShape(machine), machine };
  });

  // Guarded save-on-advance from the wizard. Throws AppError on illegal
  // transitions (serialized to a clean {code,message,hint} by the RPC layer).
  registry.register('onboardingAdvance', async (params = {}) => {
    const next = advance(loadState(), {
      step: params.step,
      status: params.status,
      data: params.data,
      error: params.error,
    });
    saveState(next);
    return { ...legacyShape(next), machine: next };
  });

  // Re-run setup (Settings → re-onboard): reset to a fresh machine.
  registry.register('onboardingReset', async () => {
    const fresh = saveState(defaultState());
    writeEnvKeys({ SIGIL_SETUP_COMPLETE: null });
    return { ...legacyShape(fresh), machine: fresh };
  });

  registry.register('listLlmProviders',       async () => ({ providers: LLM_PROVIDERS }));
  registry.register('listEmbeddingProviders', async () => ({ providers: EMBEDDING_PROVIDERS }));

  // Persist a provider selection: takes the provider id + the field
  // values the user typed and merges them into ~/.sigil/.env.
  registry.register('configureLlm', async (params) => {
    const provider = LLM_PROVIDERS.find((p) => p.id === params.id);
    if (!provider) {
      const err = new Error(`unknown llm provider: ${params.id}`);
      err.code = 'invalid_params';
      throw err;
    }
    const patch = { ...provider.env };
    for (const f of provider.fields) {
      if (f.optional && !params[f.name]) continue;
      patch[f.name] = params[f.name];
    }
    writeEnvKeys(patch);
    return { ok: true, provider: provider.id, keysWritten: Object.keys(patch) };
  });

  registry.register('configureEmbedding', async (params) => {
    const provider = EMBEDDING_PROVIDERS.find((p) => p.id === params.id);
    if (!provider) {
      const err = new Error(`unknown embedding provider: ${params.id}`);
      err.code = 'invalid_params';
      throw err;
    }
    const patch = { ...provider.env };
    for (const f of provider.fields) {
      if (f.optional && !params[f.name]) continue;
      // sharedWith means the key may already be set by the LLM step
      if (f.sharedWith === 'llm' && !params[f.name]) {
        const existing = readEnvRaw();
        if (existing[f.name]) continue;
      }
      patch[f.name] = params[f.name];
    }
    writeEnvKeys(patch);
    return { ok: true, provider: provider.id, keysWritten: Object.keys(patch) };
  });

  // Check whether picking an embedding provider would conflict with the
  // dimension of vectors already stored in the target database. Called by the
  // GUI the moment a provider is picked/switched, BEFORE writing config, so a
  // mismatch surfaces as a choice instead of a silent write failure later.
  //
  // params: { id } (embedding provider id) OR { targetDim } directly; plus
  // optional { url } / discrete db fields to probe a not-yet-saved DB. When no
  // connection is supplied, probes the currently-configured database.
  registry.register('inspectEmbeddingCompat', async (params = {}) => {
    const provider = params.id
      ? EMBEDDING_PROVIDERS.find((p) => p.id === params.id)
      : null;
    const targetDim = Number(
      params.targetDim ?? provider?.env?.EMBEDDING_DIMENSIONS ?? 0,
    );
    if (!targetDim) {
      const err = new Error('inspectEmbeddingCompat: need a provider id or targetDim');
      err.code = 'invalid_params';
      throw err;
    }

    // Resolve a connection to probe: explicit params, else current config.
    let conn;
    try {
      if (params.url) {
        const { buildUrlConnection } = await import('../../db/drivers/url.js');
        conn = buildUrlConnection(params.url);
      } else if (params.host) {
        const { buildLocalConnection } = await import('../../db/drivers/local-postgres.js');
        conn = buildLocalConnection({ db: {
          host: params.host, port: Number(params.port) || 5432,
          database: params.database || 'sigil', user: params.user || 'sigil_app',
          password: params.password || '',
        }});
      } else {
        const { default: config } = await import('../../config.js');
        const { selectDriver } = await import('../../db/drivers/index.js');
        conn = selectDriver(config).connection;
      }
    } catch (err) {
      const { diagnoseError } = await import('../../db/setup.js');
      const d = diagnoseError(err);
      return { ok: false, error: d.humanMessage, kind: d.kind, fixHint: d.fixHint };
    }

    try {
      const { inspectSchemaDims, diagnoseConflict } = await import('../../setup/compat.js');
      const schema = await inspectSchemaDims(conn);
      const result = diagnoseConflict({ targetDim, schema });
      return { ok: true, ...result, schema };
    } catch (err) {
      const { diagnoseError } = await import('../../db/setup.js');
      const d = diagnoseError(err);
      return { ok: false, error: d.humanMessage, kind: d.kind, fixHint: d.fixHint };
    }
  });

  // Destructive: empty the embedding-bearing tables so the schema can be
  // re-migrated at a new dimension. Requires explicit confirm:true from the
  // caller (the GUI shows the row count first). Truncates fact/chunk/entity/
  // embedding_cache; leaves pods/structure intact for re-ingest.
  registry.register('wipeEmbeddingData', async (params = {}) => {
    if (params.confirm !== true) {
      const err = new Error('wipeEmbeddingData: refusing without confirm:true');
      err.code = 'invalid_params';
      throw err;
    }
    try {
      const { default: cortexDb } = await import('../../db/cortex.js');
      const { EMBEDDING_TABLES } = await import('../../setup/compat.js');
      // CASCADE so dependent rows (fact_lifecycle, memberships) go too;
      // RESTART IDENTITY for a clean slate.
      await cortexDb.raw(
        `TRUNCATE ${EMBEDDING_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
      );
      return { ok: true, truncated: EMBEDDING_TABLES };
    } catch (err) {
      const { diagnoseError } = await import('../../db/setup.js');
      const d = diagnoseError(err);
      return { ok: false, error: d.humanMessage, kind: d.kind, fixHint: d.fixHint };
    }
  });

  registry.register('markOnboardingComplete', async (params = {}) => {
    writeEnvKeys({ SIGIL_SETUP_COMPLETE: 'true' });
    // Dual-write: mark the FINISH step DONE in the machine so the new GUI and
    // the legacy env flag agree. reconcile() also honors the env flag, but
    // persisting here keeps the file authoritative immediately.
    try {
      const reconciled = await reconcile(loadState());
      saveState(advance(reconciled, { step: 'FINISH', status: 'DONE' }));
    } catch { /* never block completion on a state write */ }
    // Optional: install the always-up OS service as part of finishing. Best-
    // effort — onboarding still completes if the platform is unsupported.
    let serviceInstalled = false;
    if (params.installService) {
      try {
        const { installServiceUnit } = await import('../../supervisor/index.js');
        await installServiceUnit();
        serviceInstalled = true;
      } catch { /* surfaced to the GUI as serviceInstalled:false */ }
    }
    // Schedule a soft restart so the daemon re-evaluates env and rebuilds
    // its DB pool against the freshly-saved SIGIL_DATABASE_URL. The CLI
    // / GUI auto-respawn on the next call. (Onboarding finishes regardless
    // — the next dashboard load will pick up the fresh daemon.)
    setTimeout(() => process.exit(0), 250);
    return { ok: true, restarting: true, serviceInstalled };
  });

  // Explicit daemon recycle — used by the GUI for "Apply changes" buttons.
  registry.register('restartDaemon', async () => {
    setTimeout(() => process.exit(0), 250);
    return { ok: true, restarting: true };
  });

  // Test the active LLM provider end-to-end.
  //
  // We deliberately do NOT route LLM errors through diagnoseError() — that
  // classifier's regexes (e.g. /model .* not found/) target embedding and DB
  // failures and will silently relabel an LLM "unknown model" error as an
  // embedding-model error. Surface the raw provider message so the user can
  // see what the CLI / API actually said.
  registry.register('testLlm', async () => {
    // Force a fresh provider detection so the test reflects the env keys
    // we just wrote, not what the daemon detected at startup.
    try {
      const { resetDetection, detectProvider } = await import('../../lib/llm/registry.js');
      const { readEnvRaw } = await import('../../lib/env-file.js');
      const env = readEnvRaw();
      for (const k of ['LLM_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
        'OPENROUTER_API_KEY', 'LLM_OPENROUTER_MODEL', 'LLM_OPENAI_MODEL',
        'LLM_OLLAMA_HOST', 'LLM_OLLAMA_MODEL', 'LLM_CLI_MODEL']) {
        if (env[k]) process.env[k] = env[k];
      }
      resetDetection();
      const provider = await detectProvider();
      const { prompt } = await import('../../lib/llm.js');
      const out = await prompt('Reply with the single word: ok', { caller: 'onboarding-test' });
      return { ok: true, response: String(out).slice(0, 200), provider };
    } catch (err) {
      return { ok: false, error: err.message, kind: 'llm' };
    }
  });

  registry.register('testEmbedding', async () => {
    try {
      const { embed } = await import('../../ingestion/embedder.js');
      const v = await embed('Sigil onboarding test');
      if (!Array.isArray(v) || v.length === 0) {
        return { ok: false, error: 'The embedder returned an empty vector.', kind: 'other' };
      }
      return { ok: true, dim: v.length };
    } catch (err) {
      const { diagnoseError } = await import('../../db/setup.js');
      const d = diagnoseError(err);
      return { ok: false, error: d.humanMessage, kind: d.kind, fixHint: d.fixHint };
    }
  });
}
