export function registerListFacts(registry) {
  registry.register('listFacts', async (params) => {
    const { listFacts } = await import('../../memory/facts/store.js');
    const { resolveNamespace } = await import('../../memory/namespace.js');

    // Explicit --namespace wins; else SIGIL_NAMESPACE env > committed
    // `.sigil/namespace` marker (via params.cwd) > install default.
    const namespace = resolveNamespace({ cwd: params.cwd || null, explicit: params.namespace });
    const category = params.category || undefined;
    const limit = Number.isFinite(params.limit) ? params.limit : 20;

    // P12: pod-scoped listing. `project` (git remote) resolves the project pod
    // (read-only — never creates) so the listing is the COMPLETE pod, not the
    // whole namespace.
    let podUids = null;
    if (params.project) {
      const podStore = await import('../../memory/pods/store.js');
      const { normalizeGitRemote } = await import('../../memory/pods/kinds/project.js');
      const externalId = normalizeGitRemote(params.project) || String(params.project).trim();
      const pod = await podStore.findByExternalId({ podType: 'project', externalId, namespace });
      podUids = pod ? [pod.uid] : ['__no-such-pod__'];
    }

    const facts = await listFacts({ namespace, category, limit, podUids });
    return {
      namespace,
      category: category || null,
      facts: facts.map((f) => ({
        id: f.id,
        uid: f.uid,
        content: f.content,
        category: f.category ?? null,
        importance: f.importance ?? null,
        confidence: f.confidence ?? null,
      })),
    };
  });
}
