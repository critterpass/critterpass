/**
 * Decides whether an update published from the checked-out commit can reach an installed staging
 * build, for one platform.
 *
 *   tsx tools/scripts/ci-device/update-target.ts --platform ios [--target latest]
 *
 * The target names the installed build: `latest` (the newest staging build of the platform on this
 * repository's GitHub releases, where the native-build workflow records every build's manifest), a
 * release tag (`native-staging-ios-<fingerprint>-<run id>`), or the build's native fingerprint
 * itself (the whole hash, or its first 12 characters as a release tag shows them). The commit's
 * own fingerprint is computed the way `eas update` computes the runtime version (eas-cli, the
 * `preview` environment, needs EXPO_TOKEN; Android also needs GOOGLE_SERVICES_JSON). Prints one
 * JSON line: `{verdict, local, installed, build}` with verdict `match` or `mismatch`. It exits
 * non-zero when there is no verdict (no such build, an unreadable manifest, EAS trouble), so a
 * caller never publishes on a guess.
 */
import { parseArgs } from 'node:util';

import { nativeFingerprint, parseManifest } from './build-manifest';
import type { BuildManifest } from './build-manifest';
import type { DevicePlatform } from './plan-shards';
import { githubApi } from './resolve-build';
import type { FetchJson, ReleaseRecord } from './resolve-build';

const PROFILE = 'staging';
/** How many of the newest staging releases are read before giving up. */
const RELEASES_TRIED = 3;
const TAG = /^native-staging-(ios|android)-[0-9a-f]{12}-(\d+)$/;

export type UpdateTarget =
  | { kind: 'latest' }
  | { kind: 'release'; tag: string }
  | { kind: 'fingerprint'; fingerprint: string };

/** What a target input names; undefined when it is none of the accepted forms. */
export function parseTarget(input: string, platform: DevicePlatform): UpdateTarget | undefined {
  const value = input.trim();
  if (value === 'latest') return { kind: 'latest' };
  const tag = TAG.exec(value);
  if (tag) return tag[1] === platform ? { kind: 'release', tag: value } : undefined;
  if (/^[0-9a-f]{12,64}$/i.test(value)) {
    return { kind: 'fingerprint', fingerprint: value.toLowerCase() };
  }
  return undefined;
}

/**
 * Whether a build with fingerprint `installed` runs updates of a commit whose fingerprint is
 * `local`. A shortened `installed` (12 characters or more) is compared as a prefix.
 */
export function sameFingerprint(local: string, installed: string): boolean {
  if (installed.length < 12 || local.length < 12) return false;
  const a = local.toLowerCase();
  const b = installed.toLowerCase();
  return b.length < a.length ? a.startsWith(b) : a === b;
}

/** The staging release tags of a platform from a `git/matching-refs` response, newest run first. */
export function newestStagingTags(refs: unknown, platform: DevicePlatform): string[] {
  if (!Array.isArray(refs)) return [];
  const tags: { tag: string; run: number }[] = [];
  for (const entry of refs as { ref?: unknown }[]) {
    const tag = typeof entry.ref === 'string' ? entry.ref.replace(/^refs\/tags\//, '') : '';
    const match = TAG.exec(tag);
    if (match?.[1] === platform) tags.push({ tag, run: Number(match[2]) });
  }
  return tags.sort((a, b) => b.run - a.run).map((entry) => entry.tag);
}

/** The manifest in a release body, when it is a published staging build of this platform. */
export function stagingManifest(
  release: ReleaseRecord | undefined,
  platform: DevicePlatform,
): BuildManifest | undefined {
  if (!release || release.draft === true) return undefined;
  const manifest = parseManifest(typeof release.body === 'string' ? release.body : undefined);
  if (manifest?.profile !== PROFILE || manifest.platform !== platform) return undefined;
  return manifest;
}

export type InstalledBuild = { build: string; fingerprint: string };

function describe(tag: string, manifest: BuildManifest): string {
  const number = manifest.buildNumber ? `build ${manifest.buildNumber}, ` : '';
  return `${number}${tag}`;
}

/** The build a target names and its fingerprint; throws when GitHub has no such staging build. */
export async function installedBuild(
  target: UpdateTarget,
  platform: DevicePlatform,
  fetchJson: FetchJson,
): Promise<InstalledBuild> {
  if (target.kind === 'fingerprint') {
    return { build: 'fingerprint given', fingerprint: target.fingerprint };
  }
  if (target.kind === 'release') {
    const release = (await fetchJson(`releases/tags/${target.tag}`)) as ReleaseRecord | undefined;
    const manifest = stagingManifest(release, platform);
    if (!manifest) throw new Error(`release ${target.tag} has no ${platform} staging manifest`);
    return { build: describe(target.tag, manifest), fingerprint: manifest.fingerprint };
  }
  const prefix = `native-${PROFILE}-${platform}-`;
  const tags = newestStagingTags(await fetchJson(`git/matching-refs/tags/${prefix}`), platform);
  for (const tag of tags.slice(0, RELEASES_TRIED)) {
    const release = (await fetchJson(`releases/tags/${tag}`)) as ReleaseRecord | undefined;
    const manifest = stagingManifest(release, platform);
    if (manifest) return { build: describe(tag, manifest), fingerprint: manifest.fingerprint };
  }
  throw new Error(
    `no ${platform} staging build is recorded on GitHub releases: pass the installed build's ` +
      'fingerprint, or its EAS build id',
  );
}

export type Verdict = {
  verdict: 'match' | 'mismatch';
  /** The fingerprint of the commit being published. */
  local: string;
  /** The fingerprint of the installed build. */
  installed: string;
  build: string;
};

export function verdictFor(local: string, installed: InstalledBuild): Verdict {
  const verdict = sameFingerprint(local, installed.fingerprint) ? 'match' : 'mismatch';
  return { verdict, local, installed: installed.fingerprint, build: installed.build };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { platform: { type: 'string' }, target: { type: 'string', default: 'latest' } },
  });
  const platform = values.platform;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('--platform must be ios or android');
  }
  const target = parseTarget(values.target, platform);
  if (!target) {
    throw new Error(
      `"${values.target}" is not "latest", a ${platform} staging release tag or a fingerprint`,
    );
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (target.kind !== 'fingerprint' && !repository) {
    throw new Error('GITHUB_REPOSITORY is needed to read build manifests from GitHub releases');
  }
  const fetchJson = githubApi(repository ?? '', process.env.GITHUB_TOKEN);
  const installed = await installedBuild(target, platform, fetchJson);
  console.log(JSON.stringify(verdictFor(nativeFingerprint(platform, PROFILE), installed)));
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
