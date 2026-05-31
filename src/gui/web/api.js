/**
 * Central RPC client — the one door from the GUI to the daemon. Mirrors the
 * cohort-live-web axios-wrapper convention: a single place that adds context
 * and turns a structured daemon error ({code,message,hint}) into a toast.
 *
 * Pass { quiet: true } to suppress the auto-toast (e.g. when a caller renders
 * the error inline). The thrown Error carries .code/.hint for callers.
 */
import { toast } from './toast.js';

export async function rpc(method, params = {}, { quiet = false } = {}) {
  let body;
  try {
    const res = await fetch('/api/v1/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ method, params }),
    });
    body = await res.json();
  } catch {
    const e = {
      code: 'NETWORK',
      message: 'Could not reach the Sigil daemon.',
      hint: 'Is it running? Try `sigil daemon status`.',
    };
    if (!quiet) toast({ variant: 'error', message: e.message, hint: e.hint, code: e.code });
    throw Object.assign(new Error(e.message), e);
  }

  if (!body || body.ok !== true) {
    const e = body?.error || { code: 'UNKNOWN', message: 'request failed' };
    if (!quiet) toast({ variant: 'error', message: e.message, hint: e.hint, code: e.code });
    throw Object.assign(new Error(e.message || 'request failed'), e);
  }
  return body.data;
}
