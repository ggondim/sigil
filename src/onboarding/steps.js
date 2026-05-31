/**
 * Onboarding step definitions — the explicit state machine's shape.
 *
 * Steps run in this order. Each step has a `validate(data)` invariant that must
 * hold before it can be marked DONE (mirrors the mycohort "enum state validated
 * at one layer" discipline), and a `skippable` flag. CONNECTORS is first
 * (the user is "asked for connections + provider"); DATABASE sits late because
 * auto-provision is the slowest/most error-prone step.
 */

export const STEP_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DONE: 'DONE',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR',
};

/** A step is "terminal" (no longer blocks the wizard) when DONE or SKIPPED. */
export const TERMINAL = new Set([STEP_STATUS.DONE, STEP_STATUS.SKIPPED]);

export const STEPS = [
  { id: 'CONNECTORS', skippable: true, validate: () => true },
  { id: 'PROVIDER', skippable: false, validate: (d) => Boolean(d?.llmProvider) },
  { id: 'EMBEDDING', skippable: false, validate: (d) => Boolean(d?.provider) },
  { id: 'DATABASE', skippable: false, validate: (d) => Boolean(d?.pgvector) && Number(d?.migrationsRan) > 0 },
  { id: 'FINISH', skippable: false, validate: () => true },
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));

/** Required steps must reach DONE for onboarding to be COMPLETED. */
export function isComplete(steps) {
  return STEPS.every((def) => {
    const st = steps[def.id]?.status;
    return def.skippable ? TERMINAL.has(st) : st === STEP_STATUS.DONE;
  });
}

/** First step that is not yet terminal — the wizard's current position. */
export function firstOpenStep(steps) {
  const open = STEP_IDS.find((id) => !TERMINAL.has(steps[id]?.status));
  return open || 'FINISH';
}
