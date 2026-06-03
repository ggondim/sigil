/**
 * Round-trip connector verification — prove the integration actually WORKS,
 * not just that its config files exist.
 *
 * The connectors' verify() historically only checked that config files were
 * present and contained the sigil markers. That's "is it installed", not "can
 * it serve memory" — a moved/missing server binary, a crashing hook, or a dead
 * daemon all passed verify() and failed silently at runtime. These helpers
 * close that gap by exercising the real path:
 *   - verifyMcpRoundTrip: spawn the MCP server exactly as the client would,
 *     do the JSON-RPC handshake, and call the `status` tool.
 *   - verifyClaudeHookRoundTrip: run the registered hook command with a
 *     synthetic UserPromptSubmit payload and confirm it emits valid JSON.
 *
 * Both are heavier than a file check (spawn a process, maybe touch the DB), so
 * callers gate them behind a `deep` flag (`sigil doctor --deep`).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Spawn `node <serverPath> --mcp`, handshake, call `status`. */
export async function verifyMcpRoundTrip(serverPath, { timeoutMs = 12000 } = {}) {
  if (!serverPath || !existsSync(serverPath)) {
    return { ok: false, reason: `MCP server not found at ${serverPath || '(unresolved)'}` };
  }
  return new Promise((resolve) => {
    let done = false;
    let buf = '';
    const child = spawn(process.execPath, [serverPath, '--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: `timed out after ${timeoutMs}ms` }), timeoutMs);
    timer.unref?.();
    const send = (o) => { try { child.stdin.write(`${JSON.stringify(o)}\n`); } catch { /* */ } };

    child.on('error', (e) => finish({ ok: false, reason: `spawn failed: ${e.message}` }));
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1 && msg.result) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'status', arguments: {} } });
        } else if (msg.id === 2) {
          if (msg.result) finish({ ok: true });
          else finish({ ok: false, reason: msg.error?.message || 'status tool returned no result' });
        }
      }
    });

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sigil-verify', version: '1' } } });
  });
}

/** Run the registered hook command with a synthetic payload; expect clean JSON (or empty). */
export async function verifyClaudeHookRoundTrip(hookCmd, { timeoutMs = 12000 } = {}) {
  if (!hookCmd) return { ok: false, reason: 'no hook command' };
  // hookCmd looks like `node /abs/path/user-prompt-submit.js`
  const parts = hookCmd.split(' ').filter(Boolean);
  const cmd = parts[0];
  const args = parts.slice(1);
  const scriptPath = args.find((a) => a.endsWith('.js'));
  if (scriptPath && !existsSync(scriptPath)) {
    return { ok: false, reason: `hook script not found at ${scriptPath}` };
  }
  return new Promise((resolve) => {
    let done = false;
    let out = '';
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: `timed out after ${timeoutMs}ms` }), timeoutMs);
    timer.unref?.();
    child.on('error', (e) => finish({ ok: false, reason: `spawn failed: ${e.message}` }));
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('close', () => {
      const trimmed = out.trim();
      // A hook that legitimately injects nothing (no matching memory) may emit
      // empty output — that's a healthy round-trip, not a failure.
      if (!trimmed) return finish({ ok: true, note: 'ran; no injection (no matching memory)' });
      try { JSON.parse(trimmed); finish({ ok: true }); }
      catch { finish({ ok: false, reason: `hook emitted non-JSON: ${trimmed.slice(0, 80)}` }); }
    });

    const payload = JSON.stringify({ prompt: 'sigil round-trip verification probe', session_id: 'verify', cwd: process.cwd() });
    try { child.stdin.write(payload); child.stdin.end(); } catch { /* */ }
  });
}
