/**
 * Setup step: Database (thin orchestrator).
 *
 * This file owns ONLY the step contract (detect / validate / apply) and routes
 * the resolved choice to the right service module. Each service is independent
 * and testable on its own:
 *   - ../db/detect.js   — what's on the machine (drives the UI's choices)
 *   - ../db/local.js    — connect to / start a local Postgres install
 *   - ../db/docker.js   — spin up a dedicated Sigil Postgres container
 *   - ../db/external.js — point at a managed / self-hosted connection string
 *   - ../db/test.js     — common connection verification
 *
 * "Detection drives the UI": detect() reports state, the GUI presents the
 * choice (+ confirm popup for external), then apply() runs one linear path.
 */
import { detectDatabase } from '../db/detect.js';
import { provisionLocal } from '../db/local.js';
import { provisionDocker } from '../db/docker.js';
import { provisionExternal } from '../db/external.js';
import { StepError } from '../db/shared.js';

export const id = 'database';
export const title = 'Database';

export const detect = detectDatabase;

export function validate(input = {}) {
  const errors = {};
  if (!['local', 'docker', 'url'].includes(input.mode)) {
    errors.mode = 'choose one of: local, docker, url';
  }
  if (input.mode === 'url' && !input.url) errors.url = 'a connection string is required';
  if (input.mode === 'local' && input.action && !['connect', 'start'].includes(input.action)) {
    errors.action = 'must be connect or start';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * @param {object} input  resolved choice (mode + fields)
 * @param {(p:{pct:number,label:string})=>void} emit  progress sink
 */
export async function apply(input = {}, emit = () => {}) {
  const v = validate(input);
  if (!v.ok) throw new StepError({ message: `Invalid database input: ${JSON.stringify(v.errors)}`, kind: 'other' });

  if (input.mode === 'local') return provisionLocal(input, emit);
  if (input.mode === 'docker') return provisionDocker(input, emit);
  return provisionExternal(input, emit);
}

export { StepError };
export default { id, title, detect, validate, apply };
