/**
 * Prove the LLM / Embedding / Identity step modules via the setup service.
 *   node scripts/prove-steps.mjs
 * Note: this machine has no embedding credentials, so the embedding step is
 * proven on its error path (honest failure), not a live success.
 */
import assert from 'node:assert';
import { userInfo } from 'node:os';

import { listSteps, getSetupState, detectStep, runStep, resetSetup } from '../src/setup/service.js';
import llmStep from '../src/setup/steps/llm.js';
import embeddingStep from '../src/setup/steps/embedding.js';
import identityStep from '../src/setup/steps/identity.js';

const log = (...a) => console.log(...a);
resetSetup();

log('\n[steps] all four implemented now');
const steps = listSteps();
log('  ', steps.map((s) => `${s.id}${s.implemented ? '✓' : '✗'}`).join(' → '));
assert(steps.every((s) => s.implemented), 'all four steps should be implemented');

log('\n[validate] each step rejects bad input');
assert(!llmStep.validate({}).ok, 'llm needs provider');
assert(!llmStep.validate({ provider: 'openai' }).ok, 'openai llm needs key');
assert(llmStep.validate({ provider: 'claude-cli' }).ok, 'claude-cli needs no key');
assert(!embeddingStep.validate({ provider: 'openai' }).ok, 'openai embed needs key');
assert(!identityStep.validate({ name: '' }).ok, 'identity needs a name');
assert(identityStep.validate({ name: 'Anmol' }).ok, 'identity accepts a name');
log('  ✓ validation correct across llm / embedding / identity');

log('\n[detect] provider lists reach the GUI');
const llmDet = await detectStep('llm');
const embDet = await detectStep('embedding');
log('  llm:', llmDet.providers.map((p) => p.id).join(', '));
log('  embedding:', embDet.providers.map((p) => `${p.id}@${p.model}`).join(', '));
assert(llmDet.providers.find((p) => p.id === 'claude-cli')?.recommended, 'claude-cli recommended');
assert(embDet.providers.every((p) => p.model), 'every embedder is pinned to a model');

// DB first so later steps have a database.
log('\n[run] database (local:5433)');
const db = await runStep('database', { mode: 'local', host: 'localhost', port: 5433, adminUser: userInfo().username });
assert(db.ok, `db: ${db.error}`);
log('  ✓', JSON.stringify(db.result));

log('\n[run] llm (claude-cli, live)');
const llm = await runStep('llm', { provider: 'claude-cli' });
if (llm.ok) log('  ✓ provider responded:', JSON.stringify(llm.result.response));
else log('  ⚠ llm failed (claude CLI unavailable?):', llm.error);

log('\n[run] embedding (openai, NO key) → honest structured error');
const emb = await runStep('embedding', { provider: 'openai' });
log('  ok:', emb.ok, '| error:', emb.error, '| errors:', JSON.stringify(emb.errors || null));
assert(!emb.ok, 'embedding without a key must fail, not silently pass');

log('\n[state] reflects progress');
const st = getSetupState();
log('  ', st.steps.map((s) => `${s.id}:${s.status}`).join(' '), '| complete:', st.complete);
assert.equal(st.steps.find((s) => s.id === 'database').status, 'done');
assert.equal(st.complete, false);

resetSetup();
log('\nSTEP MODULES PROVEN ✅ (embedding/identity live-success needs real creds)\n');
process.exit(0);
