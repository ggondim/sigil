// Sigil GUI — vanilla JS. Onboarding wizard + dashboard.
import { toast } from './toast.js';
import { connectorCard } from './components.js';
import { initSetup } from './setup.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

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
  if (name === 'settings') { refreshEnv(); refreshSettingsClients(); }
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
  // Config summary from the config store (config.json), secrets masked.
  try {
    const c = await rpc('setup.config', {});
    const db = c.database || {};
    const dbDesc = db.mode === 'url' ? `connection URL (${db.urlHost || '—'})`
      : db.mode === 'docker' ? `Docker container (localhost:${db.port})`
      : db.mode === 'local' ? `local Postgres (${db.host}:${db.port})`
      : 'not configured';
    $('#cfg-db').textContent = `${dbDesc}${c.setup?.steps?.database === 'done' ? ' · ready' : ''}`;
    $('#cfg-llm').textContent = c.llm?.provider ? `${c.llm.provider}${c.llm.model ? ` · ${c.llm.model}` : ''}` : 'not configured';
    $('#cfg-emb').textContent = c.embedding?.provider
      ? `${c.embedding.provider} · ${c.embedding.model} · ${c.embedding.dim}d`
      : 'not configured';
    const tbody = $('#env-table tbody');
    if (tbody) {
      const rows = [
        ['Database', dbDesc],
        ['LLM provider', c.llm?.provider || '—'],
        ['LLM model', c.llm?.model || '—'],
        ['LLM key', c.llm?.hasKey ? 'configured' : '—'],
        ['Embedding provider', c.embedding?.provider || '—'],
        ['Embedding model', c.embedding?.model || '—'],
        ['Embedding dim', String(c.embedding?.dim || '—')],
        ['Embedding key', c.embedding?.hasKey ? 'configured' : '—'],
        ['Name', c.identity?.name || '—'],
      ];
      tbody.innerHTML = rows.map(([k, v]) => `<tr><td class="mono">${escape(k)}</td><td>${escape(v)}</td></tr>`).join('');
    }
  } catch (err) {
    const tbody = $('#env-table tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="2" class="empty">${escape(err.message)}</td></tr>`;
  }
}

// ── Settings: coding agents ──────────────────────────────────────────
// Same flow as the onboarding CONNECTORS step, surfaced post-onboarding so
// users who skipped the step (or completed setup before this card existed)
// can still wire up Claude Code / Cursor / Codex / Kiro / Hermes.
async function refreshSettingsClients() {
  const host = $('#settings-connectors');
  if (!host) return;
  try {
    const { connectors } = await rpc('listConnectors');
    host.innerHTML = '';
    if (!connectors.length) {
      host.innerHTML = '<div class="muted">no agents registered</div>';
      return;
    }
    connectors.forEach((c) => host.appendChild(connectorCard(c, onSettingsClientAction)));
  } catch (err) {
    host.innerHTML = `<div class="muted">could not load agents: ${escape(err.message)}</div>`;
  }
}

async function onSettingsClientAction(id, action) {
  const host = $('#settings-connectors');
  const card = host?.querySelector(`[data-id="${id}"]`);
  if (action === 'disconnect') {
    try {
      await rpc('disconnectConnector', { id });
      toast({ variant: 'success', message: `${id} disconnected` });
    } catch (err) { toast({ variant: 'error', message: err.message, hint: err.hint, code: err.code }); }
    return refreshSettingsClients();
  }
  if (card) card.replaceWith(connectorCard({ id, label: id, hint: '', uiState: 'connecting' }, onSettingsClientAction));
  try {
    await rpc('connectConnector', { id });
    toast({ variant: 'success', message: `${id} connected` });
  } catch (err) {
    toast({ variant: 'error', message: err.message || `could not connect ${id}`, hint: err.hint, code: err.code });
  }
  return refreshSettingsClients();
}

// ── Settings: live provider switcher (LLM + embedding) ───────────────
// Drives the same setup service the first-run wizard uses (setup.detect +
// setup.run). "Apply" persists config + live-tests, then restarts the daemon
// so the new provider takes effect; the 5s health poll recovers from the gap.
const cfgSwitch = { kind: null, step: null, providerId: null, providers: [] };

async function openSwitcher(kind) {
  cfgSwitch.kind = kind;
  cfgSwitch.step = kind === 'llm' ? 'llm' : 'embedding';
  cfgSwitch.providerId = null;
  $('#cfg-switch-title').textContent = kind === 'llm' ? 'Change LLM provider' : 'Change embedding provider';
  $('#cfg-switch-conflict').innerHTML = '';
  $('#cfg-switch-fields').innerHTML = '';
  const res = $('#cfg-switch-result'); res.style.display = 'none'; res.textContent = '';
  $('#cfg-switch').style.display = '';
  try {
    const { providers } = await rpc('setup.detect', { step: cfgSwitch.step });
    cfgSwitch.providers = providers || [];
    $('#cfg-switch-cards').innerHTML = cfgSwitch.providers.map((p) => `
      <label class="provider-card" data-cfg-id="${escape(p.id)}">
        <span class="check"></span>
        <span class="name">${escape(p.label)}${p.recommended ? ' <span class="badge info" style="margin-left:8px;">RECOMMENDED</span>' : ''}</span>
        <span class="hint">${escape(p.hint)}</span>
      </label>`).join('');
  } catch (err) {
    $('#cfg-switch-cards').innerHTML = `<div class="muted">failed: ${escape(err.message)}</div>`;
  }
}

// Fields to collect for the chosen provider (llm: from the catalog; embedding:
// synthesized — a key unless it can reuse the LLM key, + an Ollama host).
function cfgSwitchFields(p) {
  if (cfgSwitch.step === 'llm') return p.fields || [];
  const f = [];
  if (p.keyed && !p.sharedKeyAvailable) f.push({ name: 'apiKey', label: `${p.label} API key`, type: 'password', placeholder: 'paste key' });
  if (p.id === 'ollama') f.push({ name: 'host', label: 'Ollama host', type: 'text', placeholder: 'http://localhost:11434' });
  return f;
}

function selectSwitchProvider(id) {
  cfgSwitch.providerId = id;
  $$('#cfg-switch-cards .provider-card').forEach((c) => c.classList.toggle('selected', c.dataset.cfgId === id));
  const p = cfgSwitch.providers.find((x) => x.id === id);
  if (!p) return;
  const fields = cfgSwitchFields(p);
  $('#cfg-switch-fields').innerHTML = fields.length
    ? fields.map((f) => `<label class="field"><span class="label">${escape(f.label)}</span>
        <input type="${escape(f.type)}" data-cfg-field="${escape(f.name)}" placeholder="${escape(f.placeholder || '')}" autocomplete="off"></label>`).join('')
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
  const input = { provider: cfgSwitch.providerId };
  $$('#cfg-switch-fields [data-cfg-field]').forEach((i) => { if (i.value) input[i.dataset.cfgField] = i.value; });
  const out = $('#cfg-switch-result');
  out.style.display = 'block'; out.className = 'result'; out.textContent = 'saving…';
  try {
    const res = await rpc('setup.run', { step: cfgSwitch.step, input });
    if (!res.ok) {
      out.classList.add('err');
      const msg = res.error || (res.errors && Object.values(res.errors)[0]) || 'failed';
      out.textContent = `✗ ${msg}${res.hint ? `\n  → ${res.hint}` : ''}`;
      return;
    }
    out.classList.add('ok');
    out.textContent = cfgSwitch.step === 'llm'
      ? `✓ LLM responded: "${res.result?.response || 'ok'}"`
      : `✓ embedder healthy — ${res.result?.dim}-dim`;
    restartAndClose(out);
  } catch (err) {
    out.classList.add('err'); out.textContent = `✗ ${err.message}`;
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
// Native config-store-driven setup (replaces the legacy onboardingState wizard).
initSetup();
setInterval(refreshHealth, 5000);
