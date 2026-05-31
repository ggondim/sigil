/**
 * Connectors RPC — GUI-facing wrapper over the client registry
 * (src/lib/clients/*). Lets the wizard render click-to-connect cards and
 * connect/disconnect Sigil into Claude Code, Cursor, Kiro, etc.
 *
 * UI status derived per card:
 *   connected   — Sigil is installed into this client (verify().installed)
 *   available   — client detected on the machine but Sigil not installed yet
 *   unavailable — client not detected here
 *   error       — surfaced by the GUI when a connect/verify call throws
 *
 * Reuses the registry contract unchanged: meta/detect/install/uninstall/verify.
 */
import { listClients } from '../../lib/clients/index.js';
import { AppError } from '../../lib/errors.js';

function uiStatus(detected, installed) {
  if (installed) return 'connected';
  if (detected) return 'available';
  return 'unavailable';
}

async function findClient(id) {
  const clients = await listClients();
  const client = clients.find((c) => c.id === id);
  if (!client) {
    const err = new AppError({ errorCode: 'VALIDATION_ERROR', message: `unknown connector: ${id}` });
    throw err;
  }
  return client;
}

export function registerConnectors(registry) {
  registry.register('listConnectors', async () => {
    const clients = await listClients();
    const connectors = await Promise.all(
      clients.map(async (c) => {
        const [detected, verified] = await Promise.all([
          Promise.resolve().then(() => c.detect()).catch(() => false),
          Promise.resolve().then(() => c.verify()).catch((e) => ({ installed: false, reason: e?.message })),
        ]);
        const installed = Boolean(verified?.installed);
        return {
          id: c.id,
          label: c.label,
          hint: c.hint,
          detected: Boolean(detected),
          installed,
          status: uiStatus(Boolean(detected), installed),
          reason: verified?.reason || null,
        };
      }),
    );
    return { connectors };
  });

  // Install Sigil into a client, then verify it actually took.
  registry.register('connectConnector', async (params = {}) => {
    const client = await findClient(params.id);
    let actions = [];
    try {
      const res = await client.install({ dryRun: false });
      actions = res?.actions || [];
    } catch (err) {
      throw new AppError({ errorCode: 'CONNECTOR_INSTALL_FAILED', message: err?.message, data: { id: client.id } });
    }
    const verified = await Promise.resolve()
      .then(() => client.verify())
      .catch((e) => ({ installed: false, reason: e?.message }));
    if (!verified?.installed) {
      throw new AppError({
        errorCode: 'CONNECTOR_VERIFY_FAILED',
        hint: verified?.reason || undefined,
        data: { id: client.id, reason: verified?.reason || null },
      });
    }
    return { ok: true, id: client.id, status: 'connected', actions };
  });

  registry.register('disconnectConnector', async (params = {}) => {
    const client = await findClient(params.id);
    let actions = [];
    try {
      const res = await client.uninstall({ dryRun: false });
      actions = res?.actions || [];
    } catch (err) {
      throw new AppError({ errorCode: 'CONNECTOR_INSTALL_FAILED', message: err?.message, data: { id: client.id } });
    }
    return { ok: true, id: client.id, status: 'available', actions };
  });
}
