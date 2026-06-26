/**
 * P8 — per-person tokens for the hosted /mcp endpoint.
 *
 * A single hosted daemon serves a whole team over MCP-HTTP. To keep the fork's
 * P7 ownership isolation working (private/session pods scoped by
 * `created_by_origin`), each caller must map to a STABLE origin. This module
 * maps an inbound bearer token to an origin id; the /mcp route threads that
 * origin into the request-context so currentOrigin() stamps + filters by it.
 *
 * Configure via env SIGIL_MCP_TOKENS as JSON:
 *     {"<token>": "<origin>", ...}
 *   or {"<token>": { "origin": "<id>", "label": "<name>" }, ...}
 *
 * Unset/empty/malformed => feature off: only the local gui.token authenticates
 * /mcp and writes fall back to the local config device.id (current behavior).
 */
import { timingSafeEqual } from 'node:crypto';

let cache = null;

function loadMap() {
  if (cache) return cache;
  const map = new Map();
  const raw = process.env.SIGIL_MCP_TOKENS;
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      for (const [tok, val] of Object.entries(obj)) {
        if (!tok) continue;
        const origin = typeof val === 'string' ? val : (val && val.origin);
        if (origin) map.set(tok, String(origin));
      }
    } catch { /* malformed -> empty map (feature stays off) */ }
  }
  cache = map;
  return map;
}

function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

/**
 * Resolve a provided bearer token against the configured per-person map.
 * @returns {{ matched: boolean, origin: string|null }}
 */
export function resolveTokenOrigin(provided) {
  if (!provided || typeof provided !== 'string') return { matched: false, origin: null };
  for (const [tok, origin] of loadMap()) {
    if (safeEq(provided, tok)) return { matched: true, origin };
  }
  return { matched: false, origin: null };
}

export function mcpTokensConfigured() {
  return loadMap().size > 0;
}

// Test/maintenance hook: drop the cached parse (e.g. after env rotation).
export function _resetMcpTokenCache() { cache = null; }
