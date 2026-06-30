import { z } from 'zod';

import { daemonCall } from '../daemon-call.js';
import { textResponse } from '../utils.js';

function registerRememberTool(server) {
  server.tool(
    'remember',
    `Save one or more standalone facts to the Sigil knowledge base.
Each fact is classified, embedded, deduped against existing memory, and stored.
Use when: the user states a durable preference, decision, constraint, or factual claim worth recalling later.
Pass each distinct fact as its own array element — don't concatenate unrelated facts into one string.
Facts are written under the agent provenance "mcp" and survive across sessions.`,
    {
      facts: z.array(z.union([
        z.string(),
        z.object({ content: z.string(), category: z.string().optional(), importance: z.enum(['vital', 'supplementary']).optional() }),
      ])).min(1).describe('Facts to remember — cada item é uma string OU { content, category?, importance? }. category: decision|convention|architecture|business_rule|workflow|domain_knowledge|key_insight|issue|metric|action_item|preference|opinion|personal|experience. importance: vital|supplementary.'),
      namespace: z.string().optional().describe('Target namespace. Defaults to the config default namespace.'),
      project: z.string().optional().describe('Project identity = the git remote (e.g. "github.com/3gr4m/the-coffee-proprias"). Attaches the facts to that project POD — use it so memory is pod-scoped (recommended).'),
    },
    async ({ facts, namespace, project }) => {
      const data = await daemonCall('remember', { facts, namespace, project });

      const parts = [];
      if (data.added)        parts.push(`${data.added} new`);
      if (data.updated)      parts.push(`${data.updated} updated`);
      if (data.alreadyKnown) parts.push(`${data.alreadyKnown} already known`);
      const summary = parts.length ? parts.join(', ') : 'nothing stored';

      return textResponse(`Remembered ${facts.length} input${facts.length === 1 ? '' : 's'} → ${summary} (namespace: ${data.namespace}).`);
    },
  );
}

export { registerRememberTool };
