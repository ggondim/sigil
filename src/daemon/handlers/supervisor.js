/**
 * Supervisor RPCs — let the GUI (finish step / Settings) install the always-up
 * OS service and read its status. The daemon runs as the user, so it can run
 * launchctl/systemctl/schtasks on their behalf.
 */
import {
  installServiceUnit, uninstallService, serviceStatus,
} from '../../supervisor/index.js';
import { getDbHealth } from '../registry-holder.js';

export function registerSupervisor(registry) {
  registry.register('serviceStatus', async () => {
    const status = await serviceStatus();
    return { ...status, db: getDbHealth?.() ?? null };
  });

  // Install the unit, then hand off: this daemon exits so the OS service's
  // KeepAlive/Restart brings up a fresh supervised instance that binds the
  // socket. (The daemon must not SIGTERM itself mid-RPC.)
  registry.register('serviceInstall', async () => {
    const res = await installServiceUnit();
    setTimeout(() => process.exit(0), 400);
    return { ok: true, handingOff: true, ...res };
  });

  registry.register('serviceUninstall', async () => {
    const res = await uninstallService();
    return { ok: true, ...res };
  });
}
