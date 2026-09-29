import { describe, expect, it } from 'vitest';

import { artifactOf, noMatchMessage, overrideFor } from './resolve-build';
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

describe('build resolution', () => {
  it('picks the override URL for each platform', () => {
    const input = 'https://expo.dev/a/ios.tar.gz, https://expo.dev/a/app.apk';
    expect(overrideFor(input, 'ios')).toBe('https://expo.dev/a/ios.tar.gz');
    expect(overrideFor(input, 'android')).toBe('https://expo.dev/a/app.apk');
    expect(overrideFor('https://expo.dev/a/ios.tar.gz', 'android')).toBeUndefined();
    expect(overrideFor('', 'ios')).toBeUndefined();
  });

  it('prefers the simulator archive of a build record', () => {
    expect(
      artifactOf({ id: 'b1', artifacts: { applicationArchiveUrl: 'x.tar.gz', buildUrl: 'y' } }),
    ).toEqual({ id: 'b1', url: 'x.tar.gz' });
    expect(artifactOf({ id: 'b2', artifacts: { buildUrl: 'y.apk' } })).toEqual({
      id: 'b2',
      url: 'y.apk',
    });
    expect(artifactOf({ id: 'b3', artifacts: {} })).toBeUndefined();
    expect(artifactOf(undefined)).toBeUndefined();
  });
});

describe('noMatchMessage', () => {
  it('names the latest build as the build_url to pass, and never falls back to it', () => {
    const message = noMatchMessage('android', 'abc', { id: 'b1', url: 'https://x/app.apk' });
    expect(message).toContain('fingerprint abc');
    expect(message).toContain('build_url=https://x/app.apk');
    expect(noMatchMessage('android', 'abc', undefined)).toContain('Run an e2e-test build');
  });
});
