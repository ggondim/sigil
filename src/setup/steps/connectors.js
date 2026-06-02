/**
 * Setup step: Coding agents (connectors).
 *
 * Unlike the provider steps (pick-one → apply), connectors are a multi-toggle
 * list: the GUI connects/disconnects each agent via the existing
 * connectConnector / disconnectConnector RPCs (same as the dashboard Settings
 * panel). This step's apply() is therefore a no-op that just marks the step
 * done — connecting any number (including zero) is fine, so it's effectively
 * skippable. Detection lives in the client modules (multi-signal: config dir /
 * app bundle / CLI binary).
 */
export const id = 'connectors';
export const title = 'Coding agents';

export function validate() {
  return { ok: true }; // connectors are optional
}

export async function apply() {
  // Connections already happened via connectConnector; nothing to persist here.
  return { ok: true };
}

export default { id, title, validate, apply };
