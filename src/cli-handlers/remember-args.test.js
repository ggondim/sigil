import { describe, it, expect } from 'vitest';

import { buildRememberRespawnArgs } from './remember-args.js';

describe('buildRememberRespawnArgs', () => {
  it('forwards --namespace to the detached re-exec (the regression)', () => {
    const args = buildRememberRespawnArgs(['--bg', '--namespace=hermes-cli'], ['a fact']);
    expect(args).toEqual(['remember', '--namespace=hermes-cli', 'a fact']);
  });

  it('strips both --bg and --background so the child does not re-background', () => {
    expect(buildRememberRespawnArgs(['--bg'], ['x'])).toEqual(['remember', 'x']);
    expect(buildRememberRespawnArgs(['--background'], ['x'])).toEqual(['remember', 'x']);
    expect(buildRememberRespawnArgs(['--background', '--namespace=ns'], ['x']))
      .toEqual(['remember', '--namespace=ns', 'x']);
  });

  it('forwards every passthrough flag, not just --namespace (future-proof)', () => {
    const args = buildRememberRespawnArgs(['--bg', '--namespace=ns', '--future'], ['x']);
    expect(args).toEqual(['remember', '--namespace=ns', '--future', 'x']);
  });

  it('preserves multiple facts (incl. stdin-sourced) in order', () => {
    expect(buildRememberRespawnArgs(['--bg'], ['f1', 'f2', 'f3']))
      .toEqual(['remember', 'f1', 'f2', 'f3']);
  });

  it('handles no flags and no facts', () => {
    expect(buildRememberRespawnArgs([], [])).toEqual(['remember']);
  });
});
