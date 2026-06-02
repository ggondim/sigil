/**
 * Prove the setup service: detection, state, progress events on the bus
 * (exactly what the GUI WebSocket forwards), and step status persistence.
 *   node scripts/prove-setup-service.mjs
 */
import assert from 'node:assert';
import { userInfo } from 'node:os';

import bus from '../src/daemon/events.js';
import { getSetupState, listSteps, detectStep, runStep, resetSetup } from '../src/setup/service.js';

const PORT = 5433;
const log = (...a) => console.log(...a);

// Capture the setup events the GUI would receive over the WebSocket.
const events = [];
bus.subscribe((evt) => { if (evt.type === 'setup') events.push(evt); });

resetSetup();

log('\n[steps] planned order + implemented flags');
const steps = listSteps();
log('  ', steps.map((s) => `${s.id}${s.implemented ? '' : '(planned)'}`).join(' → '));
assert.deepEqual(steps.map((s) => s.id), ['database', 'llm', 'embedding', 'identity']);
assert(steps.find((s) => s.id === 'database').implemented, 'database should be implemented');

log('\n[state] before running anything');
let state = getSetupState();
log('   complete:', state.complete, '| currentStep:', state.currentStep);
assert.equal(state.complete, false);
assert.equal(state.currentStep, 'database');

log('\n[detect] database');
const det = await detectStep('database');
log('   local running on', det.local.port, '| docker:', det.docker.available);
assert(det.local.running);

log('\n[run] database (mode:local, port 5433) — progress events:');
const res = await runStep('database', { mode: 'local', host: 'localhost', port: PORT, adminUser: userInfo().username });
for (const e of events.filter((e) => e.step === 'database')) {
  log(`   • ${e.status.padEnd(6)} ${String(e.pct ?? '').padStart(3)}  ${e.label}`);
}
assert(res.ok, `run should succeed: ${res.error}`);

log('\n[state] after database');
state = getSetupState();
log('   database status:', state.steps.find((s) => s.id === 'database').status);
log('   currentStep:', state.currentStep, '(null only when all planned steps done)');
assert.equal(state.steps.find((s) => s.id === 'database').status, 'done');
assert.equal(state.complete, false, 'not complete — llm/embed/identity still pending');

// Assert the event stream shape the GUI relies on.
const dbEvents = events.filter((e) => e.step === 'database');
assert(dbEvents[0].status === 'active' && dbEvents.at(-1).status === 'done', 'should go active → done');
assert(dbEvents.some((e) => e.pct === 100), 'should reach 100%');

// Error-path shape: invalid input emits a structured error event.
log('\n[run] invalid input → structured error event');
const bad = await runStep('database', { mode: 'nope' });
const errEvt = events.filter((e) => e.step === 'database' && e.status === 'error').at(-1);
log('   error event:', JSON.stringify({ status: errEvt.status, errors: errEvt.errors }));
assert(!bad.ok && bad.errors?.mode, 'invalid mode should fail with field errors');

resetSetup();
log('\nSETUP SERVICE PROOFS PASSED ✅\n');
process.exit(0);
