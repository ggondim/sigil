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

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createMcpServer } from '../mcp/build-server.js';
import { setInProcessDispatch } from '../mcp/daemon-call.js';

let wired = false;

// Point the MCP tools' daemonCall() at the in-process registry. Idempotent;
// called once when the HTTP server starts.
export function wireInProcessDispatch(registry) {
  if (wired) return;
  setInProcessDispatch(async (method, params) => {
    const r = await registry.dispatch(method, params ?? {}, { transport: 'mcp-http', agent: 'mcp' });
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
export async function handleMcpRequest(req, res) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Tear down when the response finishes so we don't leak per-request instances.
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}
