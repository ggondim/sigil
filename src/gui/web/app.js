// Sigil GUI — vanilla JS. Onboarding wizard + dashboard.
import { toast } from './toast.js';
import { connectorCard, dbFlowRow, setFlowRow } from './components.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

// Onboarding machine step (SCREAMING_SNAKE) → wizard section id.
const MACHINE_TO_STEP = { CONNECTORS: 'connectors', PROVIDER: 'llm', EMBEDDING: 'embedding', DATABASE: 'database', FINISH: 'finish' };
async function persistStep(step, status, data = {}) {
  try { await rpc('onboardingAdvance', { step, status, data }); }
  catch (err) { /* non-fatal: state persistence is best-effort */ void err; }
}

// ── RPC ──────────────────────────────────────────────────────────────
async function rpc(method, params = {}) {
  const res = await fetch('/api/v1/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.ok) {
    const e = body.error || {};
    throw Object.assign(new Error(e.message || 'rpc error'), { code: e.code, hint: e.hint });
  }
  return body.data;
}

// ── Helpers ──────────────────────────────────────────────────────────
const escape = (v) => {
  if (v === null || v === undefined) return '—';
  return String(v).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
};
const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
};
const formatTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' '); }
  catch { return iso; }
};
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); return true; }
    catch { return false; }
    finally { document.body.removeChild(ta); }
  }
}

// ════════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ════════════════════════════════════════════════════════════════════
const wizardState = { step: 'connectors', llmProvider: null, embProvider: null, llmProviders: [], embProviders: [], connectorsLoaded: false, dbInit: false, connectedCount: 0 };

const STEP_ORDER = ['connectors', 'llm', 'embedding', 'database', 'finish'];

function setOnbStep(stepId) {
  wizardState.step = stepId;
  const idx = STEP_ORDER.indexOf(stepId);
  $$('.onboarding-step').forEach((el) => {
    const i = STEP_ORDER.indexOf(el.dataset.obStep);
    el.classList.remove('active', 'done', 'future');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
    else el.classList.add('future');
  });
  $$('.wizard-step').forEach((el) => el.classList.toggle('active', el.dataset.step === stepId));
  // Lazy-fetch per-step data when first entering a step.
  if (stepId === 'connectors' && !wizardState.connectorsLoaded) loadConnectors();
  if (stepId === 'llm' && !wizardState.llmProviders.length) loadLlmProviders();
  if (stepId === 'embedding' && !wizardState.embProviders.length) loadEmbeddingProviders();
  if (stepId === 'database' && !wizardState.dbInit) initDbStep();
  if (stepId === 'finish') renderFinish();
  document.querySelector('.onboarding-content')?.scrollTo(0, 0);
}

async function loadOnboardingState() {
  try {
    const state = await rpc('onboardingState');
    if (state.setupComplete) {
      $('#onboarding').hidden = true;
      return;
    }
    $('#onboarding').hidden = false;
    if (state.steps.database.done) $('#ob-db-next').disabled = false;
    if (state.steps.llm.done) $('#ob-llm-next').disabled = false;
    if (state.steps.embedding.done) $('#ob-emb-next').disabled = false;
    // Resume at the machine's current step (refresh mid-wizard → same place).
    const resume = MACHINE_TO_STEP[state.machine?.currentStep];
    if (resume && resume !== 'connectors') setOnbStep(resume);
    else setOnbStep('connectors');
  } catch {
    // Could not reach daemon — show the first step anyway.
    $('#onboarding').hidden = false;
  }
}

// ── Connectors step ──────────────────────────────────────────────────
async function loadConnectors() {
  wizardState.connectorsLoaded = true;
  const host = $('#ob-connectors');
  try {
    const { connectors } = await rpc('listConnectors');
    wizardState.connectedCount = connectors.filter((c) => c.status === 'connected').length;
    renderConnectors(connectors);
  } catch (err) {
    host.innerHTML = `<div class="muted">could not load connectors: ${escape(err.message)}</div>`;
  }
}

function renderConnectors(connectors) {
  const host = $('#ob-connectors');
  host.innerHTML = '';
  connectors.forEach((c) => host.appendChild(connectorCard(c, onConnectorAction)));
}

async function onConnectorAction(id, action) {
  const host = $('#ob-connectors');
  const card = host.querySelector(`[data-id="${id}"]`);
  if (action === 'disconnect') {
    try {
      await rpc('disconnectConnector', { id });
      toast({ variant: 'success', message: `${id} disconnected` });
    } catch (err) { toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code }); }
    return loadConnectors();
  }
  // connect / retry → optimistic "connecting" card, then refresh.
  if (card) card.replaceWith(connectorCard({ id, label: id, hint: '', uiState: 'connecting' }, onConnectorAction));
  try {
    await rpc('connectConnector', { id });
    toast({ variant: 'success', message: `${id} connected` });
  } catch (err) {
    toast({ variant: 'error', message: err.message || `could not connect ${id}`, hint: err.hint, code: err.code });
  }
  return loadConnectors();
}

// ── DB step (linear guided flow) ─────────────────────────────────────
function dbMode() {
  return $('input[name="db-mode"]:checked')?.value || 'url';
}

$('#db-mode-cards')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-db-mode]');
  if (!card || card.hidden) return;
  $$('#db-mode-cards .provider-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  card.querySelector('input').checked = true;
  const mode = card.dataset.dbMode;
  $('#ob-db-url').style.display    = mode === 'url'    ? '' : 'none';
  $('#ob-db-fields').style.display = mode === 'fields' ? '' : 'none';
  $('#ob-db-setup').textContent = mode === 'docker' ? 'Create local database' : 'Set up database';
});

// Probe Docker once; if present, surface the recommended "Local (automatic)"
// mode and select it by default. Otherwise leave URL selected.
async function initDbStep() {
  wizardState.dbInit = true;
  try {
    const d = await rpc('dbDockerAvailable');
    const note = $('#ob-db-docker-note');
    if (d.available) {
      const dockerCard = $('#ob-db-mode-docker');
      dockerCard.hidden = false;
      dockerCard.click();
    } else if (note) {
      note.hidden = false;
      note.textContent = `Docker not detected (${d.reason || 'unavailable'}) — use a connection URL or local Postgres.`;
    }
  } catch { /* leave URL mode as the default */ }
}

function obDbParams() {
  if (dbMode() === 'url') return { url: $('#ob-db-url-input').value.trim() };
  return {
    host: $('#ob-db-host').value.trim(),
    port: Number($('#ob-db-port').value),
    database: $('#ob-db-db').value.trim(),
    user: $('#ob-db-user').value.trim(),
    password: $('#ob-db-pass').value,
  };
}

function dbFlowInit(rows) {
  const flow = $('#ob-db-flow');
  flow.hidden = false;
  flow.innerHTML = '';
  rows.forEach(([id, label]) => flow.appendChild(dbFlowRow(id, label)));
  return flow;
}

$('#ob-db-setup')?.addEventListener('click', async () => {
  const btn = $('#ob-db-setup');
  btn.disabled = true;
  $('#ob-db-next').disabled = true;
  const mode = dbMode();
  try {
    if (mode === 'docker') {
      await runDockerFlow();
    } else {
      await runUrlFlow();
    }
  } finally {
    btn.disabled = false;
  }
});

async function runDockerFlow() {
  const flow = dbFlowInit([['provision', 'Create pgvector container'], ['migrate', 'Run migrations']]);
  setFlowRow(flow, 'provision', { phase: 'active', detail: 'pulling image + starting…' });
  try {
    const r = await rpc('dbProvisionDocker');
    setFlowRow(flow, 'provision', { phase: 'done', detail: `${r.container} :${r.port}${r.reused ? ' (reused)' : ''}` });
    setFlowRow(flow, 'migrate', { phase: 'done', detail: `${r.migrationsRan} migrations · pgvector ✓` });
    await onDbReady({ pgvector: true, migrationsRan: r.migrationsRan, mode: 'docker' });
  } catch (err) {
    setFlowRow(flow, 'provision', { phase: 'error', detail: err.code || 'failed' });
    toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code });
  }
}

async function runUrlFlow() {
  const params = obDbParams();
  const flow = dbFlowInit([['test', 'Test connection'], ['pgvector', 'Enable pgvector'], ['migrate', 'Run migrations']]);
  // 1. test
  setFlowRow(flow, 'test', { phase: 'active', detail: 'connecting…' });
  let test;
  try {
    test = await rpc('testDbConnection', params);
  } catch (err) {
    setFlowRow(flow, 'test', { phase: 'error', detail: err.code || 'failed' });
    return toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code });
  }
  if (!test.ok) {
    setFlowRow(flow, 'test', { phase: 'error', detail: test.code || test.stage || 'failed' });
    return toast({ variant: 'error', message: test.error || 'connection failed', hint: test.fixHint, code: test.kind });
  }
  setFlowRow(flow, 'test', { phase: 'done', detail: `${test.provider} · ${test.connectMs}ms` });
  // 2. pgvector
  if (!test.pgvector) {
    setFlowRow(flow, 'pgvector', { phase: 'active', detail: 'installing…' });
    try {
      const pg = await rpc('ensurePgvector', params);
      if (!pg.ok || !pg.installed) throw Object.assign(new Error(pg.error || 'could not enable pgvector'), { hint: pg.fixHint });
      setFlowRow(flow, 'pgvector', { phase: 'done', detail: pg.version ? `v${pg.version}` : 'enabled' });
    } catch (err) {
      setFlowRow(flow, 'pgvector', { phase: 'error', detail: err.code || 'failed' });
      return toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code });
    }
  } else {
    setFlowRow(flow, 'pgvector', { phase: 'done', detail: 'already enabled' });
  }
  // 3. persist + migrate
  setFlowRow(flow, 'migrate', { phase: 'active', detail: 'writing env + migrating…' });
  try {
    if (params.url) {
      await rpc('writeEnv', { patch: { SIGIL_DATABASE_URL: params.url, SIGIL_DB_HOST: null, SIGIL_DB_PORT: null, SIGIL_DB_NAME: null, SIGIL_DB_USER: null, SIGIL_DB_PASSWORD: null } });
    } else {
      await rpc('writeEnv', { patch: { SIGIL_DB_HOST: params.host, SIGIL_DB_PORT: String(params.port), SIGIL_DB_NAME: params.database, SIGIL_DB_USER: params.user, SIGIL_DB_PASSWORD: params.password, SIGIL_DATABASE_URL: null } });
    }
    const m = await rpc('runMigrations', params);
    setFlowRow(flow, 'migrate', { phase: 'done', detail: `batch ${m.batchNo} · ${m.ran.length} applied` });
    await onDbReady({ pgvector: true, migrationsRan: m.ran.length, mode: dbMode() });
  } catch (err) {
    setFlowRow(flow, 'migrate', { phase: 'error', detail: err.code || 'failed' });
    toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code });
  }
}

async function onDbReady(data) {
  $('#ob-db-next').disabled = false;
  toast({ variant: 'success', message: 'Database ready.' });
  await persistStep('DATABASE', 'DONE', data);
}

// ── LLM provider step ───────────────────────────────────────────────
async function loadLlmProviders() {
  try {
    const { providers } = await rpc('listLlmProviders');
    wizardState.llmProviders = providers;
    $('#ob-llm-cards').innerHTML = providers.map((p) => `
      <label class="provider-card" data-llm-id="${escape(p.id)}">
        <span class="check"></span>
        <span class="name">${escape(p.label)}${p.recommended ? ' <span class="badge info" style="margin-left:8px;">RECOMMENDED</span>' : ''}</span>
        <span class="hint">${escape(p.hint)}</span>
      </label>
    `).join('');
    // Auto-select recommended
    const recommended = providers.find((p) => p.recommended);
    if (recommended) selectLlmProvider(recommended.id);
  } catch (err) {
    $('#ob-llm-cards').innerHTML = `<div class="muted">failed: ${escape(err.message)}</div>`;
  }
}
function selectLlmProvider(id) {
  wizardState.llmProvider = id;
  $$('#ob-llm-cards .provider-card').forEach((c) => c.classList.toggle('selected', c.dataset.llmId === id));
  const p = wizardState.llmProviders.find((x) => x.id === id);
  if (!p) return;
  if (!p.fields.length) {
    $('#ob-llm-fields').innerHTML = `<p class="muted text-sm">No additional configuration needed — Sigil will use your local Claude Code subscription.</p>`;
  } else {
    $('#ob-llm-fields').innerHTML = p.fields.map((f) => `
      <label class="field">
        <span class="label">${escape(f.label)}${f.optional ? ' <span class="muted text-xs">(optional)</span>' : ''}</span>
        <input type="${f.type}" data-llm-field="${escape(f.name)}" placeholder="${escape(f.placeholder || '')}" autocomplete="off">
      </label>
    `).join('');
  }
}
$('#ob-llm-cards')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-llm-id]');
  if (card) selectLlmProvider(card.dataset.llmId);
});
$('#ob-llm-save')?.addEventListener('click', async () => {
  if (!wizardState.llmProvider) return;
  const fields = {};
  $$('#ob-llm-fields [data-llm-field]').forEach((i) => { if (i.value) fields[i.dataset.llmField] = i.value; });
  const out = $('#ob-llm-result');
  out.hidden = false; out.className = 'result'; out.textContent = 'saving…';
  try {
    await rpc('configureLlm', { id: wizardState.llmProvider, ...fields });
    out.textContent = 'env written. Testing live LLM call…';
    const test = await rpc('testLlm', {});
    if (test.ok) {
      out.classList.add('ok');
      out.textContent += `\n✓ provider responded: "${test.response}"`;
      $('#ob-llm-next').disabled = false;
      await persistStep('PROVIDER', 'DONE', { llmProvider: wizardState.llmProvider });
    } else {
      out.classList.add('err');
      out.textContent += `\n✗ test failed: ${test.error}`;
      toast({ variant: 'error', message: test.error || 'LLM test failed', hint: test.fixHint, code: test.kind });
    }
  } catch (err) {
    out.classList.add('err');
    out.textContent = `✗ ${err.message}`;
  }
});

// ── Embedding step ──────────────────────────────────────────────────
async function loadEmbeddingProviders() {
  try {
    const { providers } = await rpc('listEmbeddingProviders');
    wizardState.embProviders = providers;
    $('#ob-emb-cards').innerHTML = providers.map((p) => `
      <label class="provider-card" data-emb-id="${escape(p.id)}">
        <span class="check"></span>
        <span class="name">${escape(p.label)}${p.recommended ? ' <span class="badge info" style="margin-left:8px;">RECOMMENDED</span>' : ''}</span>
        <span class="hint">${escape(p.hint)}</span>
      </label>
    `).join('');
    const r = providers.find((p) => p.recommended);
    if (r) selectEmbProvider(r.id);
  } catch (err) {
    $('#ob-emb-cards').innerHTML = `<div class="muted">failed: ${escape(err.message)}</div>`;
  }
}
function selectEmbProvider(id) {
  wizardState.embProvider = id;
  $$('#ob-emb-cards .provider-card').forEach((c) => c.classList.toggle('selected', c.dataset.embId === id));
  const p = wizardState.embProviders.find((x) => x.id === id);
  if (!p) return;
  const visibleFields = p.fields.filter((f) => !f.sharedWith);
  if (!visibleFields.length) {
    const sharedNote = p.fields.find((f) => f.sharedWith === 'llm')
      ? '<p class="muted text-sm">Reuses the API key from your LLM step.</p>'
      : '<p class="muted text-sm">No configuration needed.</p>';
    $('#ob-emb-fields').innerHTML = sharedNote;
  } else {
    $('#ob-emb-fields').innerHTML = visibleFields.map((f) => `
      <label class="field">
        <span class="label">${escape(f.label)}</span>
        <input type="${f.type}" data-emb-field="${escape(f.name)}" placeholder="${escape(f.placeholder || '')}" autocomplete="off">
      </label>
    `).join('');
  }
}
$('#ob-emb-cards')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-emb-id]');
  if (card) selectEmbProvider(card.dataset.embId);
});
// Shared embedding apply+gate, used by both the wizard and Settings.
// 1. Check dim-compat against the target DB BEFORE writing config.
// 2. If a conflict (DB has data at a different dim) → render Wipe/Cancel,
//    do NOT write config. Caller stays put until the user resolves it.
// 3. Otherwise configure + live-test, surfacing honest errors.
// Returns true on success (embedder healthy), false otherwise.
async function applyEmbeddingProvider({ providerId, fields, out, conflictHost, onSuccess }) {
  const prov = (wizardState.embProviders || []).find((p) => p.id === providerId);
  out.hidden = false; out.className = 'result';
  out.textContent = 'checking compatibility with your database…';

  // Dim-conflict gate (skip silently if the DB isn't reachable yet — the
  // embedder test below will surface that honestly).
  try {
    const compat = await rpc('inspectEmbeddingCompat', { id: providerId });
    if (compat.ok && compat.conflict) {
      renderConflictCard({
        host: conflictHost, compat, providerId, fields,
        out, onResolved: () => applyEmbeddingProvider({ providerId, fields, out, conflictHost, onSuccess }),
      });
      return false;
    }
  } catch { /* DB unreachable — let the embed test report the real cause */ }

  out.textContent = 'saving…';
  try {
    await rpc('configureEmbedding', { id: providerId, ...fields });
    out.textContent = 'env written. Testing embed call…';
    const test = await rpc('testEmbedding', {});
    if (test.ok) {
      out.classList.add('ok');
      out.textContent = `✓ embedder healthy — returned ${test.dim}-dim vector (${escape(prov?.label || providerId)})`;
      if (onSuccess) onSuccess(test);
      return true;
    }
    out.classList.add('err');
    out.textContent = `✗ ${test.error || 'embed test failed'}`;
    if (test.fixHint) out.textContent += `\n  → ${test.fixHint}`;
    return false;
  } catch (err) {
    out.classList.add('err');
    out.textContent = `✗ ${err.message}`;
    return false;
  }
}

// Render the dimension-conflict resolution card: Wipe (destructive, confirmed)
// or Cancel. Never auto-destroys. `host` (the conflict container element) gets
// the card; `onResolved` re-runs the apply after a successful wipe.
function renderConflictCard({ host, compat, out, onResolved }) {
  const target = host || out.parentElement;
  const rows = Object.entries(compat.rowsAtRisk || {})
    .map(([t, n]) => `${n.toLocaleString()} ${t}`).join(', ');
  const card = document.createElement('div');
  card.className = 'result err conflict-card';
  card.innerHTML = `
    <strong>Embedding size mismatch.</strong>
    Your database stores <b>${compat.currentDim}-dim</b> vectors, but this provider produces
    <b>${compat.targetDim}-dim</b>. They can't coexist — every save would fail.
    <div class="muted" style="margin:6px 0;">At risk: ${escape(rows)} (${compat.totalAtRisk.toLocaleString()} rows).</div>
    <div class="flex-row" style="margin-top:8px;">
      <button type="button" class="btn danger" data-conflict-wipe>Wipe data & switch to ${compat.targetDim}-dim</button>
      <button type="button" class="btn" data-conflict-cancel>Cancel</button>
    </div>
    <div class="muted text-sm" style="margin-top:6px;">Wipe deletes all ${compat.totalAtRisk.toLocaleString()} stored vectors. Pods/structure are kept; re-ingest to repopulate.</div>
  `;
  out.hidden = true;
  // Remove any prior card before adding a fresh one.
  target.querySelectorAll('.conflict-card').forEach((c) => c.remove());
  target.appendChild(card);

  card.querySelector('[data-conflict-cancel]').addEventListener('click', () => {
    card.remove();
    out.hidden = false; out.className = 'result';
    out.textContent = 'Cancelled — no changes made. Pick a provider matching your data, or wipe to switch.';
  });
  card.querySelector('[data-conflict-wipe]').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'Wiping…';
    try {
      const r = await rpc('wipeEmbeddingData', { confirm: true });
      if (!r.ok) { btn.textContent = `Wipe failed: ${r.error}`; btn.disabled = false; return; }
      card.remove();
      // Re-migrate the now-empty schema to the new dim happens on next
      // migration/restart; re-run the apply which will now find no conflict.
      if (onResolved) await onResolved();
    } catch (err) {
      btn.textContent = `Wipe failed: ${err.message}`; btn.disabled = false;
    }
  });
}

$('#ob-emb-save')?.addEventListener('click', async () => {
  if (!wizardState.embProvider) return;
  const fields = {};
  $$('#ob-emb-fields [data-emb-field]').forEach((i) => { if (i.value) fields[i.dataset.embField] = i.value; });
  const ok = await applyEmbeddingProvider({
    providerId: wizardState.embProvider,
    fields,
    out: $('#ob-emb-result'),
    conflictHost: $('#ob-emb-fields')?.parentElement,
    onSuccess: () => {
      $('#ob-emb-next').disabled = false;
      persistStep('EMBEDDING', 'DONE', { provider: wizardState.embProvider });
    },
  });
  if (!ok) $('#ob-emb-next').disabled = true;
});

// ── Finish step ─────────────────────────────────────────────────────
async function renderFinish() {
  try {
    const [ping, state] = await Promise.all([rpc('ping'), rpc('onboardingState')]);
    $('#ob-finish-daemon').textContent = `pid ${ping.pid} · up ${formatUptime(ping.uptimeMs)}`;
    $('#ob-finish-db').textContent = state.steps.database.done
      ? `${state.steps.database.migrationsRan} migrations · pgvector ${state.steps.database.pgvector ? '✓' : '✗'}`
      : 'not configured';
    $('#ob-finish-llm').textContent = state.env.llmProvider || 'not configured';
    $('#ob-finish-emb').textContent = state.env.embeddingProvider
      ? `${state.env.embeddingProvider} · ${state.env.embeddingModel} · ${state.env.embeddingDim}d`
      : 'not configured';
  } catch { /* ignore */ }
}
$('#ob-complete')?.addEventListener('click', async () => {
  const installService = $('#ob-always-up')?.checked === true;
  try {
    const r = await rpc('markOnboardingComplete', { installService });
    if (installService && r && r.serviceInstalled === false) {
      toast({ variant: 'info', message: 'Could not install the always-up service on this platform.', hint: 'Sigil still auto-starts on first use; retry with `sigil service install`.' });
    }
  } catch { /* daemon restarts on complete — expected to drop */ }
  $('#onboarding').hidden = true;
  // Daemon is handing off (restart / service). Give it a moment, then refresh.
  setTimeout(() => refreshHealth(), 1500);
});

// ── Navigation between wizard steps ──────────────────────────────────
document.addEventListener('click', (e) => {
  const n = e.target.closest('[data-ob-next]');
  if (n) {
    e.preventDefault();
    // Persist the step we're leaving (connectors is skippable — DONE if any
    // tool connected, else SKIPPED). Provider/Embedding/Database persist on
    // their own success handlers.
    if (wizardState.step === 'connectors') {
      persistStep('CONNECTORS', wizardState.connectedCount > 0 ? 'DONE' : 'SKIPPED', {});
    }
    setOnbStep(n.dataset.obNext);
    return;
  }
  const b = e.target.closest('[data-ob-back]');
  if (b) { e.preventDefault(); setOnbStep(b.dataset.obBack); return; }
});

// ════════════════════════════════════════════════════════════════════
// DASHBOARD (unchanged behavior)
// ════════════════════════════════════════════════════════════════════
function setConn(state, label) {
  const el = $('#conn');
  el.className = `conn-status ${state}`;
  el.textContent = label;
}
function renderKv(node, entries) {
  node.innerHTML = entries.map(([k, v]) => `<div class="row"><div class="k">${escape(k)}</div><div class="v">${escape(v)}</div></div>`).join('');
}

const validRoutes = ['health', 'kb', 'devices', 'activity', 'setup', 'settings', 'methods'];
function setRoute(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  window.location.hash = name;
  if (name === 'health')   refreshHealth();
  if (name === 'kb')       refreshKb();
  if (name === 'methods')  refreshMethods();
  if (name === 'settings') refreshEnv();
  if (name === 'devices')  refreshDevices();
  if (name === 'activity') { ensureActivityWs(); loadTraces(); }
}
function routeFromHash() {
  const r = (window.location.hash || '#health').slice(1);
  return validRoutes.includes(r) ? r : 'health';
}
window.addEventListener('hashchange', () => setRoute(routeFromHash()));
$$('nav a').forEach((a) => {
  a.addEventListener('click', (e) => { e.preventDefault(); setRoute(a.dataset.route); });
});

async function refreshHealth() {
  try {
    const [ping, nodeInfo, mode] = await Promise.all([
      rpc('ping'),
      rpc('nodeInfo').catch(() => ({ enabled: false })),
      rpc('mode').catch(() => ({})),
    ]);
    $('#hc-pid').textContent = `pid ${ping.pid}`;
    $('#hc-uptime').textContent = `up ${formatUptime(ping.uptimeMs)} · ${ping.node}`;
    $('#hc-mode').textContent = mode.mode || '—';
    $('#hc-driver').textContent = mode.memoryClient ? `memory client: ${mode.memoryClient}` : '—';
    if (nodeInfo.enabled && nodeInfo.nodeId) {
      $('#hc-nodeid').textContent = nodeInfo.nodeId.slice(0, 12) + '…';
      $('#hc-nodeid').title = nodeInfo.nodeId;
      $('#hc-relay').textContent = nodeInfo.relayUrl ? new URL(nodeInfo.relayUrl).hostname : 'no relay';
    } else {
      $('#hc-nodeid').textContent = '—';
      $('#hc-relay').textContent = 'Iroh disabled';
    }
    $('#brand-badge').textContent = mode.mode || 'solo';

    const rows = [
      ['daemon pid', ping.pid], ['version', ping.version], ['node.js', ping.node],
      ['uptime', formatUptime(ping.uptimeMs)], ['mode', mode.mode || '—'],
      ['memory client', mode.memoryClient || '—'],
    ];
    if (mode.masterNodeId) rows.push(['master nodeId', mode.masterNodeId]);
    if (nodeInfo.enabled) {
      rows.push(['this nodeId', nodeInfo.nodeId || nodeInfo.error || '—']);
      if (nodeInfo.relayUrl) rows.push(['relay', nodeInfo.relayUrl]);
      if (nodeInfo.addresses?.length) rows.push(['addresses', nodeInfo.addresses.join(', ')]);
    }
    renderKv($('#health-pane'), rows);

    $('#footer-version').textContent = `v${ping.version}`;
    $('#footer-pid').textContent = ping.pid;

    setConn('ok', 'connected');
  } catch (err) { setConn('err', err.message); }
}

async function refreshKb() {
  try {
    const data = await rpc('status', {});
    renderKv($('#kb-pane'), [
      ['documents', data.documents], ['chunks', data.chunks], ['facts', data.facts],
      ['entities (docs)', data.entities.documents],
      ['entities (people)', data.entities.people],
      ['entities (topics)', data.entities.topics],
      ['relations', data.relations],
      ['hebbian edges', data.hebbian?.edgeCount ?? '—'],
    ]);
    const hot = data.hotFacts || [];
    $('#hot-facts').innerHTML = hot.length
      ? hot.map((f) => `<li>${escape(f.content.slice(0, 140))}<span class="muted" style="margin-left:8px;">${f.accessCount}×</span></li>`).join('')
      : '<li class="muted">no hot facts yet</li>';
  } catch (err) {
    $('#kb-pane').innerHTML = `<div class="row"><div class="k">error</div><div class="v">${escape(err.message)}</div></div>`;
  }
}
$('#kb-refresh')?.addEventListener('click', refreshKb);

async function refreshMethods() {
  try {
    const res = await fetch('/api/v1/methods', { credentials: 'same-origin' });
    const body = await res.json();
    $('#methods-list').innerHTML = body.data.methods.map((m) => `<li><span class="badge info">RPC</span>${escape(m)}</li>`).join('');
  } catch (err) {
    $('#methods-list').innerHTML = `<li class="muted">${escape(err.message)}</li>`;
  }
}

async function refreshEnv() {
  // Config summary (current providers) + raw env table.
  try {
    const state = await rpc('onboardingState', {});
    const e = state.env || {};
    const dbDesc = e.hasDatabaseUrl ? 'connection URL'
      : e.hasDiscreteDb ? 'local Postgres (host/port)'
      : 'not configured';
    $('#cfg-db').textContent = `${dbDesc}${state.steps?.database?.done ? ' · ready' : ''}`;
    $('#cfg-llm').textContent = e.llmProvider || 'not configured';
    $('#cfg-emb').textContent = e.embeddingProvider
      ? `${e.embeddingProvider} · ${e.embeddingModel} · ${e.embeddingDim}d`
      : 'not configured';
  } catch { /* summary best-effort */ }

  try {
    const data = await rpc('readEnv', {});
    const tbody = $('#env-table tbody');
    const rows = Object.entries(data.entries).sort(([a], [b]) => a.localeCompare(b));
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="2" class="empty">no entries</td></tr>'; return; }
    tbody.innerHTML = rows.map(([k, v]) => v.masked
      ? `<tr><td class="mono">${escape(k)}</td><td>${v.hasValue ? '<span class="badge ok">configured</span>' : '<span class="badge">empty</span>'}</td></tr>`
      : `<tr><td class="mono">${escape(k)}</td><td class="mono">${escape(v.value)}</td></tr>`
    ).join('');
  } catch (err) {
    $('#env-table tbody').innerHTML = `<tr><td colspan="2" class="empty">${escape(err.message)}</td></tr>`;
  }
}

// ── Settings: live provider switcher (LLM + embedding) ───────────────
// Reuses the wizard's provider catalogs + the shared applyEmbeddingProvider
// gate. "Apply" persists config and restarts the daemon so the new pool /
// embedder take effect; the 5s health poll recovers from the restart gap.
const cfgSwitch = { kind: null, providerId: null, providers: [] };

async function openSwitcher(kind) {
  cfgSwitch.kind = kind;
  cfgSwitch.providerId = null;
  $('#cfg-switch-title').textContent = kind === 'llm' ? 'Change LLM provider' : 'Change embedding provider';
  $('#cfg-switch-conflict').innerHTML = '';
  $('#cfg-switch-fields').innerHTML = '';
  const res = $('#cfg-switch-result'); res.style.display = 'none'; res.textContent = '';
  $('#cfg-switch').style.display = '';
  try {
    const { providers } = await rpc(kind === 'llm' ? 'listLlmProviders' : 'listEmbeddingProviders');
    cfgSwitch.providers = providers;
    // Keep the wizard's catalog in sync so applyEmbeddingProvider can label.
    if (kind === 'embedding') wizardState.embProviders = providers;
    $('#cfg-switch-cards').innerHTML = providers.map((p) => `
      <label class="provider-card" data-cfg-id="${escape(p.id)}">
        <span class="check"></span>
        <span class="name">${escape(p.label)}${p.recommended ? ' <span class="badge info" style="margin-left:8px;">RECOMMENDED</span>' : ''}</span>
        <span class="hint">${escape(p.hint)}</span>
      </label>`).join('');
  } catch (err) {
    $('#cfg-switch-cards').innerHTML = `<div class="muted">failed: ${escape(err.message)}</div>`;
  }
}

function selectSwitchProvider(id) {
  cfgSwitch.providerId = id;
  $$('#cfg-switch-cards .provider-card').forEach((c) => c.classList.toggle('selected', c.dataset.cfgId === id));
  const p = cfgSwitch.providers.find((x) => x.id === id);
  if (!p) return;
  const visible = (p.fields || []).filter((f) => !f.sharedWith);
  $('#cfg-switch-fields').innerHTML = visible.length
    ? visible.map((f) => `
        <label class="field"><span class="label">${escape(f.label)}</span>
        <input type="${f.type}" data-cfg-field="${escape(f.name)}" placeholder="${escape(f.placeholder || '')}" autocomplete="off"></label>`).join('')
    : '<p class="muted text-sm">No additional configuration needed.</p>';
  $('#cfg-switch-conflict').innerHTML = '';
}

$('#cfg-change-llm')?.addEventListener('click', () => openSwitcher('llm'));
$('#cfg-change-emb')?.addEventListener('click', () => openSwitcher('embedding'));
$('#cfg-switch-cancel')?.addEventListener('click', () => { $('#cfg-switch').style.display = 'none'; });
$('#cfg-switch-cards')?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-cfg-id]');
  if (card) selectSwitchProvider(card.dataset.cfgId);
});

$('#cfg-switch-apply')?.addEventListener('click', async () => {
  if (!cfgSwitch.providerId) return;
  const fields = {};
  $$('#cfg-switch-fields [data-cfg-field]').forEach((i) => { if (i.value) fields[i.dataset.cfgField] = i.value; });
  const out = $('#cfg-switch-result');

  if (cfgSwitch.kind === 'embedding') {
    // Route through the shared dim-conflict gate. On success, restart.
    const ok = await applyEmbeddingProvider({
      providerId: cfgSwitch.providerId,
      fields,
      out,
      conflictHost: $('#cfg-switch-conflict'),
      onSuccess: () => restartAndClose(out),
    });
    if (!ok) return;
  } else {
    out.style.display = 'block'; out.className = 'result'; out.textContent = 'saving…';
    try {
      await rpc('configureLlm', { id: cfgSwitch.providerId, ...fields });
      const test = await rpc('testLlm', {});
      if (!test.ok) {
        out.classList.add('err');
        out.textContent = `✗ ${test.error || 'LLM test failed'}${test.fixHint ? '\n  → ' + test.fixHint : ''}`;
        return;
      }
      out.classList.add('ok'); out.textContent = `✓ LLM responded: "${test.response}"`;
      restartAndClose(out);
    } catch (err) {
      out.classList.add('err'); out.textContent = `✗ ${err.message}`;
    }
  }
});

async function restartAndClose(out) {
  out.textContent += '\nApplying — restarting daemon…';
  try { await rpc('restartDaemon', {}); } catch { /* expected: connection drops on exit */ }
  setTimeout(() => { $('#cfg-switch').style.display = 'none'; refreshEnv(); refreshHealth(); }, 1500);
}

// ── Activity / causal trace log ──────────────────────────────────────
let ws = null;
let traceFilter = '';
const seenTraceUids = new Set();

function ensureActivityWs() {
  if (ws && (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/api/v1/events`);
  ws.addEventListener('open',  () => setActivityStatus('ok', 'live'));
  ws.addEventListener('close', () => {
    setActivityStatus('err', 'disconnected');
    setTimeout(() => { if (location.hash === '#activity') ensureActivityWs(); }, 1500);
  });
  ws.addEventListener('error', () => setActivityStatus('err', 'error'));
  ws.addEventListener('message', (e) => { try { onLiveEvent(JSON.parse(e.data)); } catch {} });
}
function setActivityStatus(state, label) { const el = $('#activity-status'); if (!el) return; el.className = `conn-status ${state}`; el.textContent = label; }

function onLiveEvent(evt) {
  if (evt.type === 'trace') {
    if (traceFilter && evt.kind !== traceFilter) return;
    prependTrace(evt, true);
  } else if (!traceFilter) {
    // operational events (rpc/pair/device) only shown in the unfiltered view
    prependOpEvent(evt);
  }
}

async function loadTraces() {
  const list = $('#trace-list');
  if (!list) return;
  try {
    const { traces } = await rpc('trace.list', { kind: traceFilter || undefined, limit: 50 });
    seenTraceUids.clear();
    list.innerHTML = '';
    if (!traces.length) { $('#activity-empty').style.display = 'block'; return; }
    $('#activity-empty').style.display = 'none';
    for (const t of traces) { list.appendChild(traceCard(t)); seenTraceUids.add(t.uid); }
  } catch (err) {
    list.innerHTML = `<li class="empty">failed to load history: ${escape(err.message)}</li>`;
  }
}

function prependTrace(t, isLive) {
  if (t.uid && seenTraceUids.has(t.uid)) return;
  if (t.uid) seenTraceUids.add(t.uid);
  $('#activity-empty').style.display = 'none';
  const card = traceCard(t);
  if (isLive) card.classList.add('flash');
  $('#trace-list').prepend(card);
  trimList();
}
function prependOpEvent(evt) {
  $('#activity-empty').style.display = 'none';
  const li = document.createElement('li');
  li.className = 'trace-card op';
  const ts = clock(evt.ts);
  li.innerHTML = `<div class="trace-head static">
    <span class="trace-ts">${escape(ts)}</span>
    <span class="badge ${opBadge(evt.type)}">${escape(evt.type)}</span>
    <span class="trace-summary">${opSummary(evt)}</span></div>`;
  $('#trace-list').prepend(li);
  trimList();
}
function trimList() { const ul = $('#trace-list'); while (ul.childNodes.length > 200) ul.removeChild(ul.lastChild); }

function traceCard(t) {
  const li = document.createElement('li');
  li.className = 'trace-card';
  const dur = t.durationMs != null ? `${t.durationMs}ms` : '';
  const ns = t.namespace ? `<span class="trace-ns">${escape(t.namespace)}</span>` : '';
  li.innerHTML = `
    <button class="trace-head" type="button" aria-expanded="false">
      <span class="trace-caret">▸</span>
      <span class="trace-ts">${escape(clock(t.ts))}</span>
      <span class="badge ${traceBadge(t.kind)}">${escape(t.kind)}</span>
      <span class="trace-summary">${escape(t.summary)}</span>
      ${ns}
      <span class="trace-dur">${escape(dur)}</span>
    </button>
    <div class="trace-detail" hidden></div>`;
  const head = li.querySelector('.trace-head');
  const body = li.querySelector('.trace-detail');
  head.addEventListener('click', () => {
    const isOpen = !body.hasAttribute('hidden');
    if (isOpen) { body.setAttribute('hidden', ''); head.setAttribute('aria-expanded', 'false'); li.classList.remove('open'); return; }
    if (!body.dataset.rendered) { body.innerHTML = renderTraceDetail(t); body.dataset.rendered = '1'; }
    body.removeAttribute('hidden'); head.setAttribute('aria-expanded', 'true'); li.classList.add('open');
  });
  return li;
}

// ── Detail renderers ─────────────────────────────────────────────────
function renderTraceDetail(t) {
  const d = t.detail || {};
  if (t.kind === 'search') return renderSearchTrace(d);
  if (t.kind === 'ingest') return renderIngestTrace(d);
  return `<pre class="trace-json">${escape(JSON.stringify(d, null, 2))}</pre>`;
}

const sc = (v) => (v === null || v === undefined ? '—' : String(v));

function renderSearchTrace(d) {
  const parts = [];

  if (d.routing) {
    const r = d.routing;
    parts.push(traceBlock('Routing', `
      ${kvline('intent', r.intent)}
      ${kvline('reasoning', r.reasoning)}
      ${kvline('useGraph', r.useGraph)} ${kvline('expand', r.expand)} ${kvline('limit', r.limit)}
      ${r.categories && r.categories.length ? kvline('categories', r.categories.join(', ')) : ''}
      ${r.pointInTime ? kvline('pointInTime', r.pointInTime) : ''}`));
  } else {
    parts.push(traceBlock('Routing', `<span class="muted">cognitive routing disabled for this query</span>`));
  }

  parts.push(traceBlock('Strategy', `${kvline('mode', d.strategy)} ${d.matchedEntity
    ? `· matched entity <strong>${escape(d.matchedEntity.name)}</strong> <span class="muted">(${escape(d.matchedEntity.type)}${d.matchedEntity.aliases?.length ? ', aliases: ' + escape(d.matchedEntity.aliases.join(', ')) : ''})</span>`
    : ''}`));

  const facts = (d.ranking && d.ranking.facts) || [];
  if (facts.length) {
    const rows = facts.map((f) => `<tr>
        <td class="num">${f.rank}</td>
        <td class="fact-cell">${escape(f.content)}${f.source ? ` <span class="tag">${escape(f.source)}</span>` : ''}${f.importance === 'vital' ? ' <span class="tag vital">vital</span>' : ''}</td>
        <td class="num" title="cosine similarity">${sc(f.similarity)}</td>
        <td class="num" title="RRF fusion (vector+keyword)">${sc(f.rrfRaw)}</td>
        <td class="num" title="ACT-R activation = ln(uses+1) − 0.5·ln(age_days); recency + frequency decay">${sc(f.activation)}</td>
        <td class="num" title="access count (reinforcement)">${sc(f.accessCount)}</td>
        <td class="num" title="rrf × activation × importance × confidence">${sc(f.finalScore)}</td>
        <td class="num strong" title="normalized score the ranker sorted on">${sc(f.rrfScore)}</td>
      </tr>`).join('');
    parts.push(`<div class="trace-block"><div class="trace-block-h">Ranking <span class="muted">— ${escape(d.ranking.model)}</span></div>
      <div class="trace-table-wrap"><table class="trace-table">
        <thead><tr><th>#</th><th>fact</th><th>sim</th><th>rrf</th><th>act↓</th><th>uses</th><th>final</th><th>score</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`);
  } else {
    parts.push(traceBlock('Ranking', `<span class="muted">no facts matched</span>`));
  }

  const chunks = (d.ranking && d.ranking.chunks) || [];
  if (chunks.length) {
    const rows = chunks.map((c) => `<tr>
        <td class="num">${c.rank}</td>
        <td class="fact-cell">${c.sectionHeading ? `<span class="muted">${escape(c.sectionHeading)} · </span>` : ''}${escape(c.content)}</td>
        <td class="num">${sc(c.similarity)}</td>
        <td class="num strong">${sc(c.rrfScore)}</td>
      </tr>`).join('');
    parts.push(`<div class="trace-block"><div class="trace-block-h">Chunks</div>
      <div class="trace-table-wrap"><table class="trace-table">
        <thead><tr><th>#</th><th>chunk</th><th>sim</th><th>score</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`);
  }

  if (d.synthesized) parts.push(traceBlock('Synthesized answer', `<div class="synth">${escape(d.synthesized)}</div>`));

  if (d.reinforced && d.reinforced.factIds && d.reinforced.factIds.length) {
    parts.push(traceBlock('Reinforcement (decay update)', `<span class="muted">${escape(d.reinforced.note)}</span><br>fact ids: <code class="mono">${escape(d.reinforced.factIds.join(', '))}</code>`));
  }

  return parts.join('');
}

function renderIngestTrace(d) {
  const parts = [];
  const inputs = d.inputs || (d.verdicts ? [{ input: d.title, route: d.route, counts: d.counts, verdicts: d.verdicts, entities: d.entities }] : []);

  if (d.totals) parts.push(traceBlock('Totals', `${kvline('added', d.totals.added)} ${kvline('updated', d.totals.updated)} ${kvline('alreadyKnown', d.totals.alreadyKnown)} ${kvline('inputs', d.totals.inputCount)}`));

  inputs.forEach((inp, i) => {
    const verdictRows = (inp.verdicts || []).map((v) => {
      const a = v.audm || {};
      const simTxt = a.topSimilarity != null
        ? `sim <strong>${a.topSimilarity.toFixed(3)}</strong> ${audmExplain(a)}`
        : `<span class="muted">${escape(a.decision || 'no match — new fact')}</span>`;
      const link = v.supersededId ? ` → superseded #${v.supersededId}` : v.contradictedId ? ` → contradicted #${v.contradictedId}` : '';
      return `<tr>
        <td><span class="badge ${audmBadge(v.action)}">${escape(v.action)}</span></td>
        <td class="fact-cell">${escape(v.content)}${link ? `<span class="muted">${escape(link)}</span>` : ''}</td>
        <td class="audm-cell">${simTxt}</td>
      </tr>`;
    }).join('');

    const head = `${inp.route ? `<span class="badge info">route: ${escape(inp.route)}</span> ` : ''}${inp.skipped ? '<span class="badge warn">skipped</span> ' : ''}<span class="muted">${escape(String(inp.input || '').slice(0, 160))}</span>`;
    const counts = inp.counts ? `<div class="muted text-xs" style="margin:6px 0">+${inp.counts.added} added · ~${inp.counts.updated} updated · ${inp.counts.skipped} skipped · ${inp.counts.contradicted} contradicted</div>` : '';
    const ents = inp.entities ? `<div class="text-xs muted" style="margin-top:6px">entities: ${inp.entities.entityCount}, relations: ${inp.entities.relationCount}${inp.entities.topics?.length ? ' · topics: ' + escape(inp.entities.topics.join(', ')) : ''}</div>` : '';

    parts.push(`<div class="trace-block">
      <div class="trace-block-h">Input ${inputs.length > 1 ? i + 1 : ''}</div>
      <div style="margin-bottom:6px">${head}</div>
      ${counts}
      ${verdictRows ? `<div class="trace-table-wrap"><table class="trace-table"><thead><tr><th>AUDM</th><th>fact</th><th>decision</th></tr></thead><tbody>${verdictRows}</tbody></table></div>` : '<span class="muted text-xs">no facts extracted</span>'}
      ${ents}
    </div>`);
  });

  return parts.join('') || `<pre class="trace-json">${escape(JSON.stringify(d, null, 2))}</pre>`;
}

function audmExplain(a) {
  const th = a.thresholds || {};
  if (a.decision === 'skip-duplicate') return `≥ skip ${th.skip} → near-duplicate, deduped`;
  if (a.decision === 'llm:UPDATE') return `in [${th.ambiguous}, ${th.skip}) → LLM judged UPDATE`;
  if (a.decision === 'llm:CONTRADICT') return `in [${th.ambiguous}, ${th.skip}) → LLM judged CONTRADICT`;
  if (a.decision === 'llm:ADD') return `in [${th.ambiguous}, ${th.skip}) → LLM judged distinct`;
  if (a.decision === 'below-ambiguous') return `< ambiguous ${th.ambiguous} → distinct, added`;
  return escape(a.decision || '');
}

function traceBlock(title, html) { return `<div class="trace-block"><div class="trace-block-h">${escape(title)}</div><div>${html}</div></div>`; }
function kvline(k, v) { return `<span class="kvline"><span class="muted">${escape(k)}</span> ${escape(sc(v))}</span>`; }
function clock(iso) { return (iso || '').slice(11, 19) || (iso || '').slice(0, 10); }

function traceBadge(kind) {
  if (kind === 'search') return 'info';
  if (kind === 'ingest') return 'ok';
  if (kind === 'lifecycle') return 'warn';
  return 'info';
}
function audmBadge(action) {
  const a = String(action || '').toUpperCase();
  if (a === 'ADD') return 'ok';
  if (a === 'SKIP') return '';
  if (a === 'UPDATE') return 'info';
  if (a === 'CONTRADICT') return 'err';
  return 'info';
}
function opBadge(type) {
  if (type.startsWith('write.')) return 'ok';
  if (type.startsWith('error') || type.startsWith('pair.rej')) return 'err';
  if (type.startsWith('device.rev') || type === 'meta.dropped') return 'warn';
  return 'info';
}
function opSummary(evt) {
  if (evt.type === 'rpc.connected')    return `device ${escape(evt.name || evt.deviceId)} connected`;
  if (evt.type === 'rpc.disconnected') return `device ${escape(evt.deviceId)} disconnected`;
  if (evt.type === 'rpc.denied')       return `denied ${escape(evt.method)} (${escape(evt.code)})`;
  if (evt.type === 'pair.consumed')    return `paired ${escape(evt.deviceName)}`;
  if (evt.type === 'pair.rejected')    return `pairing rejected (${escape(evt.code)})`;
  if (evt.type === 'device.revoked')   return `device ${escape(evt.deviceId)} revoked (${escape(evt.reason)})`;
  if (evt.type === 'meta.dropped')     return `${evt.count} live events dropped (backpressure)`;
  return `<code class="mono">${escape(JSON.stringify(evt))}</code>`;
}

// Filter chips + actions
$('#trace-filters')?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-trace-filter]');
  if (!chip) return;
  traceFilter = chip.dataset.traceFilter || '';
  $$('#trace-filters .chip').forEach((c) => c.classList.toggle('active', c === chip));
  loadTraces();
});
$('#trace-refresh')?.addEventListener('click', loadTraces);
$('#trace-clear')?.addEventListener('click', async () => {
  if (!confirm('Clear the entire trace log? This deletes persisted history.')) return;
  try { await rpc('trace.clear'); } catch {}
  loadTraces();
});

// ── Setup tab (legacy DB form) ──────────────────────────────────────
$('#db-mode')?.addEventListener('change', (e) => {
  $('#db-url-pane').style.display    = e.target.value === 'url'    ? '' : 'none';
  $('#db-fields-pane').style.display = e.target.value === 'fields' ? '' : 'none';
});
$('#db-test')?.addEventListener('click', async () => {
  const out = $('#db-result');
  out.style.display = 'block'; out.className = 'result'; out.textContent = 'testing…';
  try {
    const params = $('#db-mode').value === 'url' ? { url: $('#db-url').value.trim() }
      : { host: $('#db-host').value.trim(), port: Number($('#db-port').value),
          database: $('#db-database').value.trim(), user: $('#db-user').value.trim(), password: $('#db-password').value };
    const data = await rpc('testDbConnection', params);
    out.textContent = JSON.stringify(data, null, 2);
    out.classList.add(data.ok ? 'ok' : 'err');
    $('#db-migrate').disabled = !data.ok || !data.pgvector;
    if (data.ok && !data.pgvector) {
      $('#db-pgvector').hidden = false; $('#db-pgvector').disabled = false;
      out.textContent += '\n\n⚠ pgvector not installed.';
    } else { $('#db-pgvector').hidden = true; }
  } catch (err) { out.textContent = `ERROR: ${err.message}`; out.classList.add('err'); $('#db-migrate').disabled = true; }
});
$('#db-pgvector')?.addEventListener('click', async () => {
  const out = $('#db-result');
  const params = $('#db-mode').value === 'url' ? { url: $('#db-url').value.trim() }
    : { host: $('#db-host').value.trim(), port: Number($('#db-port').value),
        database: $('#db-database').value.trim(), user: $('#db-user').value.trim(), password: $('#db-password').value };
  out.textContent += '\n\nInstalling pgvector…';
  try {
    const data = await rpc('ensurePgvector', params);
    if (data.ok && data.installed) { out.textContent += `\n✓ pgvector ${data.version} installed`; $('#db-pgvector').hidden = true; $('#db-migrate').disabled = false; }
    else { out.textContent += `\n✗ ${data.error || 'unknown'} (${data.stage})`; }
  } catch (err) { out.textContent += `\nERROR: ${err.message}`; }
});
$('#db-migrate')?.addEventListener('click', async () => {
  const out = $('#db-result');
  out.textContent += '\n\nRunning migrations…';
  try {
    const data = await rpc('runMigrations', {});
    out.textContent += `\nbatch ${data.batchNo}: ${data.ran.length} migrations applied`;
  } catch (err) { out.textContent += `\nERROR: ${err.message}`; }
});

// ── Modal infrastructure ────────────────────────────────────────────
function closeModal(id) { const m = document.getElementById(id); if (m) m.hidden = true; }
function openModal(id) {
  const m = document.getElementById(id); if (!m) return;
  m.hidden = false;
  setTimeout(() => { const f = m.querySelector('input, select, textarea, button'); if (f) f.focus(); }, 30);
}
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close-modal]');
  if (closer) { e.preventDefault(); closeModal(closer.dataset.closeModal); return; }
  if (e.target.classList && e.target.classList.contains('modal') && !e.target.hidden) closeModal(e.target.id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const m of $$('.modal')) if (!m.hidden) { closeModal(m.id); return; }
});
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-copy]');
  if (!t) return;
  const node = document.getElementById(t.dataset.copy);
  if (!node) return;
  const text = Array.from(node.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BUTTON')).map((n) => n.textContent).join('').trim();
  const ok = await copyToClipboard(text);
  const orig = t.textContent;
  t.textContent = ok ? 'copied!' : 'failed';
  setTimeout(() => { t.textContent = orig; }, 1200);
});

// ── Devices ─────────────────────────────────────────────────────────
let revokeTargetId = null;
async function refreshDevices() {
  try {
    const { devices } = await rpc('device.list', {});
    const tbody = $('#dev-table tbody');
    $('#dev-count').textContent = `${devices.length} device${devices.length === 1 ? '' : 's'}`;
    if (!devices.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">no devices paired yet — click <strong>+ Add device</strong></td></tr>';
    } else {
      tbody.innerHTML = devices.map((d) => {
        const statusLabel = d.active ? 'connected' : d.revokedReason === 'compromised' ? 'compromised' : 'paused';
        const statusClass = d.active ? 'ok' : d.revokedReason === 'compromised' ? 'err' : 'warn';
        const actions = d.active
          ? `<button class="btn small danger" data-revoke="${d.id}" data-name="${escape(d.name)}">Revoke</button>`
          : d.reactivatable
            ? `<button class="btn small" data-activate="${d.id}">Re-activate</button>`
            : `<span class="muted text-xs" title="revoked as compromised">re-pair only</span>`;
        return `<tr>
          <td><div class="device-name">${escape(d.name)}</div><div class="device-sub">device #${d.id}${d.meta?.hostname ? ' · ' + escape(d.meta.hostname) : ''}</div></td>
          <td class="mono" title="${escape(d.nodeId)}">${escape(d.nodeId.slice(0, 16))}…</td>
          <td><span class="badge ${d.role === 'admin' ? 'err' : d.role === 'writer' ? 'info' : ''}">${escape(d.role)}</span></td>
          <td>${escape((d.namespaces && d.namespaces.length) ? d.namespaces.join(', ') : '(all)')}</td>
          <td class="muted">${escape(formatTime(d.lastSeenAt))}</td>
          <td><span class="pill ${statusClass}">${statusLabel}</span></td>
          <td class="actions-cell">${actions}</td>
        </tr>`;
      }).join('');
    }
  } catch (err) { $('#dev-table tbody').innerHTML = `<tr><td colspan="7" class="empty">${escape(err.message)}</td></tr>`; }

  try {
    const { codes } = await rpc('pair.list', {});
    const tbody = $('#dev-codes tbody');
    if (!codes.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">no codes outstanding</td></tr>';
    } else {
      tbody.innerHTML = codes.map((c) => {
        let status, badgeCls = '';
        if (c.consumedBy) { status = `consumed by ${escape(c.consumedBy.name)}`; badgeCls = 'ok'; }
        else if (c.expired) { status = 'expired'; badgeCls = 'err'; }
        else { status = 'pending'; badgeCls = 'warn'; }
        return `<tr>
          <td class="mono">#${c.id}</td><td>${escape(c.name)}</td>
          <td><span class="badge">${escape(c.role)}</span></td>
          <td class="muted">${escape(formatTime(c.expiresAt))}</td>
          <td><span class="badge ${badgeCls}">${status}</span></td>
          <td class="actions-cell">${!c.consumedBy ? `<button class="btn small danger" data-revoke-code="${c.id}">Revoke</button>` : ''}</td>
        </tr>`;
      }).join('');
    }
  } catch (err) { $('#dev-codes tbody').innerHTML = `<tr><td colspan="6" class="empty">${escape(err.message)}</td></tr>`; }
}
$('#dev-refresh')?.addEventListener('click', refreshDevices);

document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-revoke]');
  if (r) {
    revokeTargetId = Number(r.dataset.revoke);
    $('#revoke-target-name').textContent = r.dataset.name || `device #${revokeTargetId}`;
    const def = $('input[name="revoke-reason"][value="paused"]'); if (def) def.checked = true;
    openModal('revoke-modal');
    return;
  }
  const a = e.target.closest('[data-activate]');
  if (a) rpc('device.activate', { id: Number(a.dataset.activate) }).then(refreshDevices).catch((err) => alert(err.message));
  const cb = e.target.closest('[data-revoke-code]');
  if (cb) rpc('pair.revoke', { id: Number(cb.dataset.revokeCode) }).then(refreshDevices).catch((err) => alert(err.message));
});

$('#revoke-confirm')?.addEventListener('click', async () => {
  if (revokeTargetId == null) return;
  const reason = $('input[name="revoke-reason"]:checked').value;
  try { await rpc('device.revoke', { id: revokeTargetId, reason }); closeModal('revoke-modal'); refreshDevices(); }
  catch (err) { alert(err.message); }
});

// Highlight selected radio card in revoke modal
$$('.radio-card').forEach((card) => {
  card.addEventListener('click', () => {
    const group = card.closest('.radio-card-group') || document;
    group.querySelectorAll('.radio-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
  });
});

// Add-device modal
function resetDevModal() {
  $('#dev-form').style.display = '';
  $('#dev-result-view').hidden = true;
  $('#dev-create').hidden = false;
  $('#dev-done').hidden = true;
  $('#dev-cancel').hidden = false;
  $('#dev-name').value = ''; $('#dev-ns').value = '';
  $('#dev-ttl').value = '600'; $('#dev-role').value = 'writer';
}
$('#dev-new')?.addEventListener('click', () => { resetDevModal(); openModal('dev-modal'); });
new MutationObserver(() => { if ($('#dev-modal').hidden) { setTimeout(resetDevModal, 200); refreshDevices(); } })
  .observe($('#dev-modal'), { attributes: true, attributeFilter: ['hidden'] });

$('#dev-create')?.addEventListener('click', async () => {
  const name = $('#dev-name').value.trim(); if (!name) return alert('Device name required');
  const role = $('#dev-role').value;
  const ttl = Number($('#dev-ttl').value) || 600;
  const ns = $('#dev-ns').value.trim();
  try {
    const data = await rpc('pair.create', {
      name, role, ttlSeconds: ttl,
      namespaces: ns ? ns.split(',').map((s) => s.trim()).filter(Boolean) : [],
    });
    const cmd = `sigil join ${data.masterNodeId || '<master-node-id>'} ${data.code} --name ${data.name}`;
    $('#dev-form').style.display = 'none';
    $('#dev-result-view').hidden = false;
    $('#dev-create').hidden = true; $('#dev-cancel').hidden = true; $('#dev-done').hidden = false;
    $('#dev-result-code').firstChild.textContent = data.code + ' ';
    $('#dev-result-master').firstChild.textContent = (data.masterNodeId || '(iroh not running)') + ' ';
    $('#dev-result-cmd').textContent = cmd;
    $('#dev-result-expiry').textContent = data.expiresAt;
  } catch (err) { alert(`Create failed: ${err.message}`); }
});

// ════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════
const initial = (window.location.hash || '#health').slice(1);
setRoute(validRoutes.includes(initial) ? initial : 'health');
loadOnboardingState();
setInterval(refreshHealth, 5000);
