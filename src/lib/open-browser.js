/**
 * Cross-platform browser opener + a headless guard. Shared by `npx sigil`
 * (zero-arg) and `sigil daemon open` so there's one definition of "can/should
 * we open a browser" and "how".
 */
import { spawn } from 'node:child_process';

/** False on servers/SSH/CI (no display) or when SIGIL_HEADLESS is set. */
export function canOpenBrowser() {
  if (process.env.SIGIL_HEADLESS) return false;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  return true;
}

/** Fire-and-forget open. Returns false if the opener could not be spawned. */
export function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
      : 'xdg-open';
  try {
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}
