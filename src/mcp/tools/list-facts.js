import { z } from 'zod';

import { daemonCall } from '../daemon-call.js';
import { textResponse } from '../utils.js';

/**
 * `list_facts` — exhaustive, no-LLM, no-ranking listing of a namespace's facts.
 *
 * WHY: `search` returns only top-K query matches and `prime`/`status` are global
 * (not namespace-scoped), so neither can produce a COMPLETE per-project index.
 * This tool wraps the daemon's `listFacts` RPC so a client (or a consolidation
 * routine) can build a faithful index/overview of a project's memory, or audit
 * everything stored in a namespace. Hosted server has no project cwd, so the
 * namespace is required explicitly.
 */
function registerListFactsTool(server) {
  server.tool(
    'list_facts',
    `List ALL facts in a namespace (no LLM, no ranking, no query). Returns the full set
(up to limit), unlike search which only returns query matches. Use to build a complete
index/overview of a project's memory or to audit what is stored. Pass the namespace explicitly.`,
    {
      project: z.string().optional().describe('Project identity = the git remote (e.g. "github.com/3gr4m/the-coffee-proprias"). Lists the COMPLETE set of facts in that project POD — recommended scope.'),
      namespace: z.string().optional().describe('Namespace filter (default "default"). Prefer `project` for pod-scoping.'),
      category: z.string().optional().describe('Optional category filter (e.g. "decision", "architecture").'),
      limit: z.number().optional().default(500).describe('Max facts to return (default 500).'),
    },
    async ({ project, namespace, category, limit }) => {
      const data = await daemonCall('listFacts', {
        project,
        namespace,
        category,
        limit: Number.isFinite(limit) ? limit : 500,
        cwd: null,
      });
      const facts = data.facts || [];
      if (!facts.length) {
        return textResponse(`No facts in namespace "${data.namespace}"${data.category ? ` (category: ${data.category})` : ''}.`);
      }
      const lines = facts.map((f) => {
        const vital = f.importance === 'vital' ? ' [VITAL]' : '';
        return `- [${f.category || '?'}]${vital} ${f.content} (id:${f.id})`;
      });
      return textResponse(`Facts in "${data.namespace}" (${facts.length}):\n${lines.join('\n')}`);
    },
  );
}

export { registerListFactsTool };
