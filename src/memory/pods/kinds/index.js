/**
 * Built-in pod kind registration.
 *
 * Importing this module registers all 0.10.0 built-in kinds with the
 * pod kind registry. Code that wants the registry populated should
 * import this once near startup; downstream callers then use
 * `import { get, list, activeKinds } from './registry.js'`.
 *
 * Idempotent — registering the same kind twice is a no-op (overwrites
 * the prior entry with the same contract). The CLI startup path
 * (src/cli.js) and the MCP server entry point both import this.
 */

import { register } from '../registry.js';

import { claudeSessionKind } from './claude_session.js';
import { personKind } from './person.js';
import { projectKind } from './project.js';
import { playbookKind } from './playbook.js';
import { vitalKind } from './vital.js';

const BUILTINS = [
  claudeSessionKind,
  projectKind,
  personKind,
  playbookKind,
  vitalKind,
];

let registered = false;

export function registerBuiltins() {
  if (registered) return;
  for (const kind of BUILTINS) {
    register(kind);
  }
  registered = true;
}

registerBuiltins();
