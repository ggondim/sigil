/**
 * Build the argv tail for the detached `--bg` re-exec of `sigil remember`.
 *
 * The background path spawns a fresh `sigil remember …` that routes through the
 * daemon. It must forward every passthrough flag — notably `--namespace` — so
 * the detached write targets the namespace the caller asked for. The ONLY flags
 * dropped are the backgrounding flags themselves; forwarding them would make the
 * child re-background and spawn its own grandchild forever.
 *
 * `facts` is passed explicitly rather than re-derived from argv because the
 * facts may have come from stdin, not positional arguments.
 *
 * Regression guard: the prior implementation respawned `['remember', ...facts]`,
 * silently dropping ALL flags — so `--namespace` never reached the detached
 * write and every background `remember` landed in the daemon's default namespace.
 *
 *   flags = ['--bg', '--namespace=hermes-cli'], facts = ['x']
 *     → ['remember', '--namespace=hermes-cli', 'x']
 */
export function buildRememberRespawnArgs(flags, facts) {
  const passthroughFlags = flags.filter((f) => f !== '--bg' && f !== '--background');
  return ['remember', ...passthroughFlags, ...facts];
}
