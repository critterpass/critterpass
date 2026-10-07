import { describe, expect, it } from 'vitest';

import {
  fingerprintFileCommand,
  fingerprintFileHash,
  parseManifest,
  releaseTagPrefix,
} from './build-manifest';
import {
  artifactOf,
  buildFromRelease,
  githubBuild,
  newestTags,
  noMatchMessage,
  overrideFor,
} from './resolve-build';

const FINGERPRINT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const PREFIX = 'native-e2e-test-android-a1b2c3d4e5f6-';

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    profile: 'e2e-test',
    platform: 'android',
    fingerprint: FINGERPRINT,
    commit: 'c0ffee',
    appVersion: '1.0.0',
    buildNumber: null,
    runtimeVersion: FINGERPRINT,
    artifact: 'critterpass-e2e-test-android.apk',
    runId: '200',
    createdAt: '2026-10-07T08:00:00.000Z',
    ...overrides,
  });
}

function release(tag: string, body: string, assetName = 'critterpass-e2e-test-android.apk') {
  return {
    tag_name: tag,
    draft: false,
    body,
    assets: [
      { name: 'manifest.json', browser_download_url: `https://gh/${tag}/manifest.json` },
      { name: assetName, browser_download_url: `https://gh/${tag}/${assetName}` },
    ],
  };
}

describe('build overrides and EAS records', () => {
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

  it('says how to make a build, and names the latest EAS build without falling back to it', () => {
    const message = noMatchMessage('android', 'abc', { id: 'b1', url: 'https://x/app.apk' });
    expect(message).toContain('fingerprint abc');
    expect(message).toContain('build_url=https://x/app.apk');
    const none = noMatchMessage('android', 'abc', undefined);
    expect(none).toContain('native-build.yml');
    expect(none).not.toContain('build_url=');
  });
});

describe('build manifests', () => {
  it('names releases by profile, platform and the start of the fingerprint', () => {
    expect(releaseTagPrefix('e2e-test', 'android', FINGERPRINT)).toBe(PREFIX);
  });

  it('reads a manifest and rejects anything that is not one', () => {
    expect(parseManifest(manifest())).toMatchObject({
      profile: 'e2e-test',
      platform: 'android',
      fingerprint: FINGERPRINT,
      buildNumber: null,
    });
    expect(parseManifest('Release notes')).toBeUndefined();
    expect(parseManifest(manifest({ profile: 'preview' }))).toBeUndefined();
    expect(parseManifest(manifest({ platform: 'web' }))).toBeUndefined();
    expect(parseManifest(manifest({ fingerprint: '' }))).toBeUndefined();
    expect(parseManifest(null)).toBeUndefined();
  });

  it('reads the baked fingerprint as JSON or as a bare hash', () => {
    expect(fingerprintFileHash(`{"sources":[],"hash":"${FINGERPRINT}"}`)).toBe(FINGERPRINT);
    expect(fingerprintFileHash(`${FINGERPRINT}\n`)).toBe(FINGERPRINT);
    expect(fingerprintFileHash('')).toBeUndefined();
    expect(fingerprintFileHash('not a hash')).toBeUndefined();
  });

  it('knows where each kind of binary keeps the fingerprint', () => {
    expect(fingerprintFileCommand('a.apk')?.[1]).toContain('assets/fingerprint');
    expect(fingerprintFileCommand('a.aab')?.[1]).toContain('base/assets/fingerprint');
    expect(fingerprintFileCommand('a.ipa')?.[0]).toBe('unzip');
    expect(fingerprintFileCommand('a.tar.gz')?.[0]).toBe('tar');
    expect(fingerprintFileCommand('a.zip')).toBeUndefined();
  });
});

describe('builds on GitHub releases', () => {
  it('orders a fingerprint’s tags by run, newest first, and ignores other tags', () => {
    const refs = [
      { ref: `refs/tags/${PREFIX}99` },
      { ref: `refs/tags/${PREFIX}1200` },
      { ref: `refs/tags/${PREFIX}300` },
      { ref: `refs/tags/${PREFIX}300-notes` },
      { ref: 'refs/tags/native-e2e-test-ios-a1b2c3d4e5f6-5000' },
    ];
    expect(newestTags(refs, PREFIX)).toEqual([`${PREFIX}1200`, `${PREFIX}300`, `${PREFIX}99`]);
    expect(newestTags(undefined, PREFIX)).toEqual([]);
  });

  it('takes the binary of a release whose manifest matches the whole fingerprint', () => {
    expect(buildFromRelease(release(`${PREFIX}200`, manifest()), 'android', FINGERPRINT)).toEqual({
      id: `${PREFIX}200`,
      url: `https://gh/${PREFIX}200/critterpass-e2e-test-android.apk`,
    });
  });

  it('refuses a release for another fingerprint, platform or profile, or without its binary', () => {
    const sameStart = `${FINGERPRINT.slice(0, 12)}ffffffffffffffffffffffffffff`;
    const cases = [
      release(`${PREFIX}1`, manifest({ fingerprint: sameStart })),
      release(`${PREFIX}2`, manifest({ platform: 'ios' })),
      release(`${PREFIX}3`, manifest({ profile: 'staging' })),
      release(`${PREFIX}4`, manifest(), 'other.apk'),
      release(`${PREFIX}5`, 'hand-written notes'),
      { ...release(`${PREFIX}6`, manifest()), draft: true },
    ];
    for (const entry of cases) {
      expect(buildFromRelease(entry, 'android', FINGERPRINT)).toBeUndefined();
    }
    expect(buildFromRelease(undefined, 'android', FINGERPRINT)).toBeUndefined();
  });

  it('walks from the newest release to the first usable one', async () => {
    const asked: string[] = [];
    const pages: Record<string, unknown> = {
      [`git/matching-refs/tags/${PREFIX}`]: [
        { ref: `refs/tags/${PREFIX}100` },
        { ref: `refs/tags/${PREFIX}300` },
        { ref: `refs/tags/${PREFIX}200` },
      ],
      // The newest release lost its binary; the one before it is whole.
      [`releases/tags/${PREFIX}300`]: release(`${PREFIX}300`, manifest(), 'manifest-only'),
      [`releases/tags/${PREFIX}200`]: release(`${PREFIX}200`, manifest()),
      [`releases/tags/${PREFIX}100`]: release(`${PREFIX}100`, manifest()),
    };
    const fetchJson = (apiPath: string) => {
      asked.push(apiPath);
      return Promise.resolve(pages[apiPath]);
    };
    const build = await githubBuild('android', FINGERPRINT, fetchJson);
    expect(build?.id).toBe(`${PREFIX}200`);
    expect(asked).not.toContain(`releases/tags/${PREFIX}100`);
  });

  it('finds nothing when the fingerprint has no release', async () => {
    expect(await githubBuild('ios', FINGERPRINT, () => Promise.resolve([]))).toBeUndefined();
    expect(await githubBuild('ios', FINGERPRINT, () => Promise.resolve(undefined))).toBeUndefined();
  });
});
