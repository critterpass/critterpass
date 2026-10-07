import { describe, expect, it } from 'vitest';

import {
  installedBuild,
  newestStagingTags,
  parseTarget,
  sameFingerprint,
  verdictFor,
} from './update-target';

const MAIN = 'e71c9323c6c8aa11bb22cc33dd44ee55ff667788';
const OTHER = '0f0f0f0f0f0f11112222333344445555666677aa';

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    profile: 'staging',
    platform: 'ios',
    fingerprint: MAIN,
    commit: 'c0ffee',
    appVersion: '1.0.0',
    buildNumber: '20',
    runtimeVersion: MAIN,
    artifact: 'critterpass-staging-ios.ipa',
    runId: '300',
    createdAt: '2026-10-07T08:00:00.000Z',
    ...overrides,
  });
}

/** A repository whose releases are `bodies` by tag; records what was asked for. */
function repository(bodies: Record<string, string | { draft: true; body: string }>) {
  const asked: string[] = [];
  const fetchJson = (apiPath: string): Promise<unknown> => {
    asked.push(apiPath);
    if (apiPath.startsWith('git/matching-refs/tags/')) {
      const prefix = apiPath.slice('git/matching-refs/tags/'.length);
      const refs = Object.keys(bodies)
        .filter((tag) => tag.startsWith(prefix))
        .map((tag) => ({ ref: `refs/tags/${tag}` }));
      return Promise.resolve(refs);
    }
    const tag = apiPath.replace('releases/tags/', '');
    const entry = bodies[tag];
    if (entry === undefined) return Promise.resolve(undefined);
    return Promise.resolve(
      typeof entry === 'string'
        ? { tag_name: tag, draft: false, body: entry }
        : { tag_name: tag, ...entry },
    );
  };
  return { fetchJson, asked };
}

describe('update targets', () => {
  it('reads latest, a release tag of the platform and a fingerprint', () => {
    expect(parseTarget(' latest ', 'ios')).toEqual({ kind: 'latest' });
    expect(parseTarget('native-staging-ios-e71c9323c6c8-300', 'ios')).toEqual({
      kind: 'release',
      tag: 'native-staging-ios-e71c9323c6c8-300',
    });
    expect(parseTarget(MAIN.toUpperCase(), 'android')).toEqual({
      kind: 'fingerprint',
      fingerprint: MAIN,
    });
    expect(parseTarget('e71c9323c6c8', 'ios')).toEqual({
      kind: 'fingerprint',
      fingerprint: 'e71c9323c6c8',
    });
  });

  it('rejects another platform or profile, an EAS build id and a short hash', () => {
    expect(parseTarget('native-staging-android-e71c9323c6c8-300', 'ios')).toBeUndefined();
    expect(parseTarget('native-e2e-test-ios-e71c9323c6c8-300', 'ios')).toBeUndefined();
    expect(parseTarget('native-production-ios-e71c9323c6c8-300', 'ios')).toBeUndefined();
    expect(parseTarget('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', 'ios')).toBeUndefined();
    expect(parseTarget('e71c9323', 'ios')).toBeUndefined();
    expect(parseTarget('', 'ios')).toBeUndefined();
  });
});

describe('fingerprint comparison', () => {
  it('matches the whole hash or a prefix of 12 characters and more', () => {
    expect(sameFingerprint(MAIN, MAIN.toUpperCase())).toBe(true);
    expect(sameFingerprint(MAIN, MAIN.slice(0, 12))).toBe(true);
    expect(sameFingerprint(MAIN, OTHER)).toBe(false);
    expect(sameFingerprint(MAIN, OTHER.slice(0, 12))).toBe(false);
  });

  it('never matches on a shorter prefix, an empty value or a longer hash', () => {
    expect(sameFingerprint(MAIN, MAIN.slice(0, 11))).toBe(false);
    expect(sameFingerprint(MAIN, '')).toBe(false);
    expect(sameFingerprint('', '')).toBe(false);
    expect(sameFingerprint(MAIN, `${MAIN}00`)).toBe(false);
  });

  it('refuses a build whose fingerprint differs from the commit', () => {
    const installed = { build: 'build 19', fingerprint: OTHER };
    expect(verdictFor(MAIN, installed)).toEqual({
      verdict: 'mismatch',
      local: MAIN,
      installed: OTHER,
      build: 'build 19',
    });
    expect(verdictFor(MAIN, { build: 'build 20', fingerprint: MAIN }).verdict).toBe('match');
  });
});

describe('installed build lookup on GitHub releases', () => {
  it('orders staging tags of one platform by run id, across fingerprints', () => {
    const refs = [
      { ref: 'refs/tags/native-staging-ios-e71c9323c6c8-99' },
      { ref: 'refs/tags/native-staging-ios-0f0f0f0f0f0f-1000' },
      { ref: 'refs/tags/native-staging-android-e71c9323c6c8-2000' },
      { ref: 'refs/tags/native-staging-ios-e71c9323c6c8-draft' },
    ];
    expect(newestStagingTags(refs, 'ios')).toEqual([
      'native-staging-ios-0f0f0f0f0f0f-1000',
      'native-staging-ios-e71c9323c6c8-99',
    ]);
    expect(newestStagingTags(undefined, 'ios')).toEqual([]);
  });

  it('takes the newest staging build of the platform', async () => {
    const { fetchJson } = repository({
      'native-staging-ios-e71c9323c6c8-300': manifest(),
      'native-staging-ios-0f0f0f0f0f0f-400': manifest({ fingerprint: OTHER, buildNumber: '21' }),
      'native-staging-android-e71c9323c6c8-500': manifest({ platform: 'android' }),
      'native-e2e-test-ios-e71c9323c6c8-600': manifest({ profile: 'e2e-test' }),
    });
    expect(await installedBuild({ kind: 'latest' }, 'ios', fetchJson)).toEqual({
      build: 'build 21, native-staging-ios-0f0f0f0f0f0f-400',
      fingerprint: OTHER,
    });
  });

  it('skips a draft and a release whose body is not a staging manifest of the platform', async () => {
    const { fetchJson } = repository({
      'native-staging-ios-e71c9323c6c8-300': manifest(),
      'native-staging-ios-0f0f0f0f0f0f-400': {
        draft: true,
        body: manifest({ fingerprint: OTHER }),
      },
      'native-staging-ios-0f0f0f0f0f0f-500': 'release notes',
    });
    expect((await installedBuild({ kind: 'latest' }, 'ios', fetchJson)).fingerprint).toBe(MAIN);
  });

  it('gives no build when the platform has none, and names what to pass instead', async () => {
    const { fetchJson } = repository({ 'native-staging-ios-e71c9323c6c8-300': manifest() });
    await expect(installedBuild({ kind: 'latest' }, 'android', fetchJson)).rejects.toThrow(
      /no android staging build .* fingerprint, or its EAS build id/,
    );
  });

  it('reads a named release and rejects one that is missing or of another profile', async () => {
    const tag = 'native-staging-ios-e71c9323c6c8-300';
    const { fetchJson } = repository({ [tag]: manifest() });
    expect(await installedBuild({ kind: 'release', tag }, 'ios', fetchJson)).toEqual({
      build: `build 20, ${tag}`,
      fingerprint: MAIN,
    });
    await expect(
      installedBuild(
        { kind: 'release', tag: 'native-staging-ios-e71c9323c6c8-1' },
        'ios',
        fetchJson,
      ),
    ).rejects.toThrow(/no ios staging manifest/);
    const wrong = repository({ [tag]: manifest({ profile: 'production' }) });
    await expect(installedBuild({ kind: 'release', tag }, 'ios', wrong.fetchJson)).rejects.toThrow(
      /no ios staging manifest/,
    );
  });

  it('uses a given fingerprint without asking GitHub', async () => {
    const { fetchJson, asked } = repository({});
    const installed = await installedBuild(
      { kind: 'fingerprint', fingerprint: MAIN },
      'ios',
      fetchJson,
    );
    expect(installed.fingerprint).toBe(MAIN);
    expect(asked).toEqual([]);
  });
});
