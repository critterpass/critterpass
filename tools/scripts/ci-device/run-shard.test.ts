import { describe, expect, it } from 'vitest';

import {
  annotation,
  flowSlug,
  isMaestroFailureShot,
  maestroEnvArgs,
  parseShardArgs,
} from './run-shard';

describe('parseShardArgs', () => {
  it('splits the flow list and resolves paths against the working directory', () => {
    const options = parseShardArgs(
      [
        '--',
        '--platform',
        'ios',
        '--device',
        'UDID',
        '--out',
        'out',
        '--env',
        'JS_COMMIT',
        'e2e/a.yaml e2e/b.yaml',
        'e2e/c.yaml',
      ],
      '/repo',
    );
    expect(options).toEqual({
      platform: 'ios',
      device: 'UDID',
      out: '/repo/out',
      env: ['JS_COMMIT'],
      video: false,
      flows: ['/repo/e2e/a.yaml', '/repo/e2e/b.yaml', '/repo/e2e/c.yaml'],
    });
  });

  it('requires a platform, a device, an output directory and flows', () => {
    expect(() => parseShardArgs(['--device', 'x', '--out', 'o', 'a.yaml'], '/')).toThrow(
      /platform/,
    );
    expect(() => parseShardArgs(['--platform', 'ios', '--out', 'o', 'a.yaml'], '/')).toThrow(
      /device/,
    );
    expect(() => parseShardArgs(['--platform', 'ios', '--device', 'x', 'a.yaml'], '/')).toThrow(
      /out/,
    );
    expect(() => parseShardArgs(['--platform', 'ios', '--device', 'x', '--out', 'o'], '/')).toThrow(
      /No flows/,
    );
  });
});

describe('shard helpers', () => {
  it('names a flow after its path', () => {
    expect(flowSlug('/repo/e2e/home/first-run.yaml', '/repo')).toBe('e2e__home__first-run');
  });

  it("tells Maestro's failure screenshots from the flow's own", () => {
    expect(isMaestroFailureShot('screenshot-❌-1790674881552-(app-launch)')).toBe(true);
    expect(isMaestroFailureShot('en-3b-1-first-run')).toBe(false);
  });

  it('forwards only the variables that are set', () => {
    expect(maestroEnvArgs(['A', 'B', 'C'], { A: '1', B: '' })).toEqual(['-e', 'A=1']);
  });

  it('escapes annotation data', () => {
    expect(annotation('error', 'ui-qa: TEXT_TRUNCATED', 'a%b\nc')).toBe(
      '::error title=ui-qa  TEXT_TRUNCATED::a%25b%0Ac',
    );
  });
});
