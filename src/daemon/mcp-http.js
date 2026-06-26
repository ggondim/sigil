/**
 * MCP-over-HTTP transport, served by the daemon at POST /mcp.
 *
 * WHY: MCP clients normally spawn a stdio server by absolute path
 * (`node /abs/dist/server.js --mcp`) — a path that breaks on every Node-version
 * switch or reinstall. Serving MCP over the daemon's existing HTTP server lets
 * clients register by URL instead:
 *
 *   claude mcp add sigil --transport http http://127.0.0.1:7777/mcp \
 *     --header "Authorization: Bearer $(cat ~/.sigil/gui.token)"
 *
 * The URL never changes, so the registration is immune to path drift.
 *
 * DESIGN: stateless Streamable HTTP. Each POST gets a fresh McpServer +
 * transport (no session IDs, no cross-request state) — correct for concurrent
 * clients and cheap, since all real state lives in the daemon's Postgres. The
 * tools call daemonCall(), which we short-circuit to the in-process registry
 * (no socket loopback) via setInProcessDispatch().
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMcpServer } from '../mcp/build-server.js';
import { setInProcessDispatch } from '../mcp/daemon-call.js';

// P8: per-request ownership origin (resolved from the caller's bearer token in
// http-server's /mcp route). Held in ALS so the in-process dispatch can stamp it
// into the request-context without threading it through the MCP SDK.
const originALS = new AsyncLocalStorage();
function runWithMcpOrigin(origin, fn) { return originALS.run(origin ?? null, fn); }
function currentMcpOrigin() { return originALS.getStore() ?? null; }

let wired = false;

// Point the MCP tools' daemonCall() at the in-process registry. Idempotent;
// called once when the HTTP server starts.
export function wireInProcessDispatch(registry) {
  if (wired) return;
  setInProcessDispatch(async (method, params) => {
    // P8: attribute the call to the per-person origin the /mcp route resolved
    // from the bearer token (null => fall back to local-config device.id).
    const origin = currentMcpOrigin();
    const r = await registry.dispatch(method, params ?? {}, { transport: 'mcp-http', agent: 'mcp', origin });
    if (!r || r.ok === false) {
      const err = r?.error;
      throw new Error(typeof err === 'string' ? err : (err?.message || `rpc method '${method}' failed`));
    }
    return r.data;
  });
  wired = true;
}

// Handle one POST /mcp request. Creates a per-request stateless server+transport
// and lets the SDK parse the body off the still-unread request stream.
export async function handleMcpRequest(req, res, origin = null) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Tear down when the response finishes so we don't leak per-request instances.
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  // Run the whole request (incl. tool dispatch) inside the origin ALS so P8
  // attribution reaches the fact store + search visibility filter.
  await runWithMcpOrigin(origin, async () => {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
}
