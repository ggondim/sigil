import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname } from 'node:path';

import { SIGIL_GUI_TOKEN } from '../lib/paths.js';

/**
 * Returns the GUI auth token, generating + persisting one on first use.
 * Stored at ~/.sigil/gui.token mode 0600. Anyone with read access to the
 * user's home dir can read it — that matches the existing trust boundary
 * (they could read .env too), so this is "auth for *this* user" not
 * cross-user isolation.
 */
const TOKEN_RE = /^[0-9a-f]{64}$/;

// Last token we read or generated. Used ONLY as a fallback when the file is
// momentarily unreadable — never as the authoritative value, so a token
// rotated on disk (e.g. by a daemon restart/update) is picked up without
// restarting this process. See isValidToken.
let cached = null;

/** Read the token from disk without creating one. null if missing/invalid. */
async function readTokenFromDisk() {
  try {
    const t = (await readFile(SIGIL_GUI_TOKEN, 'utf8')).trim();
    if (TOKEN_RE.test(t)) return t;
  } catch { /* missing or unreadable */ }
  return null;
}

export async function getGuiToken() {
  const onDisk = await readTokenFromDisk();
  if (onDisk) return (cached = onDisk);
  await mkdir(dirname(SIGIL_GUI_TOKEN), { recursive: true });
  const fresh = randomBytes(32).toString('hex');
  await writeFile(SIGIL_GUI_TOKEN, fresh, 'utf8');
  try { await chmod(SIGIL_GUI_TOKEN, 0o600); } catch { /* best effort */ }
  return (cached = fresh);
}

/**
 * Constant-time token compare. Always converts both sides to fixed-length
 * Buffers to avoid leaking the length of the provided token.
 *
 * Validates against the *freshest on-disk* token so that if gui.token was
 * rotated out from under a long-lived daemon (the classic split-brain after
 * a refresh/update), the live daemon self-heals instead of returning
 * "invalid token" forever. Falls back to the last-known token only if the
 * file is transiently unreadable, so an FS hiccup can't lock the user out.
 */
export async function isValidToken(provided) {
  if (!provided || typeof provided !== 'string') return false;
  const expected = (await readTokenFromDisk()) || cached || (await getGuiToken());
  if (provided.length !== expected.length) {
    // Still do a compare against a same-length placeholder so the
    // mismatch path takes equal time.
    timingSafeEqual(Buffer.from(expected), Buffer.from(expected));
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
