import { z } from 'zod';

import { daemonCall } from '../daemon-call.js';
import { textResponse } from '../utils.js';

/**
 * `prime` — the session-start preamble for MCP clients (Codex, Cursor, Kiro).
 *
 * These clients have no UserPromptSubmit/Stop hooks, so memory is NOT
 * injected or saved automatically. `prime` is the substitute: called once at
 * the start of a task, it returns Sigil's health status + fresh, project-
 * scoped facts about the user, so the agent starts grounded. It shares the
 * one preamble engine with the `sigil preamble` CLI and the Claude
 * SessionStart hook (see src/preamble/run.js).
 */
function registerPrimeTool(server) {
  server.tool(
    'prime',
    `Prime your memory for this session — CALL THIS FIRST, before answering anything.
This client has no automatic memory: nothing is recalled or saved for you.
Returns: Sigil health (DB/providers) + fresh facts about the user and this project.
If you skip it, you start with zero knowledge of who the user is or what they're working on.
After priming, still call \`search\` for specifics and \`ingest\` to save durable facts.`,
    {
      // No required args. `limit` caps how many fresh facts are pulled.
      limit: z.number().optional().default(12).describe('Max fresh facts to load (default 12)'),
    },
    async ({ limit } = {}) => {
      const { buildPreamble } = await import('../../preamble/run.js');
      const { renderPreamble } = await import('../../preamble/render.js');
      const result = await buildPreamble({
        cwd: process.cwd(),
        limit: Number.isFinite(limit) ? limit : 12,
        call: daemonCall, // reuse the MCP server's long-lived daemon socket
      });
      return textResponse(renderPreamble(result, { format: 'md', transport: 'mcp' }));
    },
  );
}

export { registerPrimeTool };
