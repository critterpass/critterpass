/**
 * Finds the e2e-test build a device run installs, for one platform.
 *
 *   tsx tools/scripts/ci-device/resolve-build.ts --platform ios [--override "<url> <url>"]
 *
 * An override (the workflow's `build_url` input: one or two artifact URLs, `.apk` for Android,
 * anything else for iOS) wins. Otherwise it computes the native fingerprint (EAS environment:
 * development, needs EXPO_TOKEN) and takes the newest build for it from this repository's GitHub
 * releases, where the native-build workflow attaches every e2e-test build (GITHUB_REPOSITORY, and
 * GITHUB_TOKEN for the API's rate limit). While no GitHub build exists for the fingerprint it
 * falls back to the latest finished EAS build for it. It never starts a build. Writes `url`,
 * `build_id`, `fingerprint` and `source` to the step outputs on GitHub Actions.
 */
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { eas, nativeFingerprint, parseManifest, releaseTagPrefix } from './build-manifest';
import type { DevicePlatform } from './plan-shards';

const PROFILE = 'e2e-test';
/** How many of a fingerprint's newest releases are read before giving up on GitHub. */
const RELEASES_TRIED = 3;

type Build = { id: string; url: string };

/** The override URL meant for `platform`, from a space- or comma-separated list. */
export function overrideFor(input: string, platform: DevicePlatform): string | undefined {
  const urls = input.split(/[\s,]+/).filter(Boolean);
  const isApk = (url: string) => /\.apk(?:$|[?#])/.test(url);
  return urls.find((url) => (platform === 'android' ? isApk(url) : !isApk(url)));
}

type BuildRecord = { id?: unknown; artifacts?: Record<string, unknown> };

/** The installable artifact of an `eas build:list --json` entry. */
export function artifactOf(build: BuildRecord | undefined): Build | undefined {
  const url = build?.artifacts?.applicationArchiveUrl ?? build?.artifacts?.buildUrl;
  if (!build || typeof build.id !== 'string' || typeof url !== 'string') return undefined;
  return { id: build.id, url };
}

/**
 * The release tags under `prefix` from a `git/matching-refs/tags/<prefix>` response, newest build
 * first: a tag ends with the id of the workflow run that made the build, and run ids only grow.
 */
export function newestTags(refs: unknown, prefix: string): string[] {
  if (!Array.isArray(refs)) return [];
  const tags: { tag: string; run: number }[] = [];
  for (const entry of refs as { ref?: unknown }[]) {
    const tag = typeof entry.ref === 'string' ? entry.ref.replace(/^refs\/tags\//, '') : '';
    const run = tag.startsWith(prefix) ? tag.slice(prefix.length) : '';
    if (/^\d+$/.test(run)) tags.push({ tag, run: Number(run) });
  }
  return tags.sort((a, b) => b.run - a.run).map((entry) => entry.tag);
}

export type ReleaseRecord = {
  tag_name?: unknown;
  draft?: unknown;
  body?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown }[];
};

/**
 * The installable build of a GitHub release, when its manifest (the release body) is an e2e-test
 * build of this platform with exactly this fingerprint and the binary is attached. The tag carries
 * only the fingerprint's first characters, so the manifest decides.
 */
export function buildFromRelease(
  release: ReleaseRecord | undefined,
  platform: DevicePlatform,
  fingerprint: string,
): Build | undefined {
  if (!release || release.draft === true || typeof release.tag_name !== 'string') return undefined;
  const manifest = parseManifest(typeof release.body === 'string' ? release.body : undefined);
  if (
    !manifest ||
    manifest.profile !== PROFILE ||
    manifest.platform !== platform ||
    manifest.fingerprint !== fingerprint
  ) {
    return undefined;
  }
  const asset = release.assets?.find((entry) => entry.name === manifest.artifact);
  if (typeof asset?.browser_download_url !== 'string') return undefined;
  return { id: release.tag_name, url: asset.browser_download_url };
}

/**
 * Why a run stops when no build matches the native fingerprint, naming the latest EAS build of the
 * profile as the `build_url` to pass when its native code still fits. Never a silent fallback.
 */
export function noMatchMessage(
  platform: DevicePlatform,
  fingerprint: string,
  latest: Build | undefined,
): string {
  const head =
    `No ${platform} "${PROFILE}" build matches fingerprint ${fingerprint}, and device runs never ` +
    `start a build. Run one for this commit: gh workflow run native-build.yml -f ref=<branch> ` +
    `-f profile=${PROFILE} -f platform=${platform}, then re-run.`;
  if (!latest) return head;
  return (
    `${head} The latest ${platform} "${PROFILE}" build on EAS is ${latest.id}: if its native code ` +
    `still fits this commit, re-run with build_url=${latest.url} (the workflow's build_url input).`
  );
}

export type FetchJson = (apiPath: string) => Promise<unknown>;

/** GitHub's REST API for this repository; a missing page (404) reads as undefined. */
export function githubApi(repository: string, token: string | undefined): FetchJson {
  const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  return async (apiPath) => {
    const response = await fetch(`${base}/repos/${repository}/${apiPath}`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`GitHub ${apiPath} answered ${String(response.status)}`);
    return response.json();
  };
}

/** The newest build on this repository's releases for the fingerprint, if any. */
export async function githubBuild(
  platform: DevicePlatform,
  fingerprint: string,
  fetchJson: FetchJson,
): Promise<Build | undefined> {
  const prefix = releaseTagPrefix(PROFILE, platform, fingerprint);
  const tags = newestTags(await fetchJson(`git/matching-refs/tags/${prefix}`), prefix);
  for (const tag of tags.slice(0, RELEASES_TRIED)) {
    const release = (await fetchJson(`releases/tags/${tag}`)) as ReleaseRecord | undefined;
    const build = buildFromRelease(release, platform, fingerprint);
    if (build) return build;
  }
  return undefined;
}

function easBuild(platform: DevicePlatform, fingerprint: string): Build {
  const filters = `--platform ${platform} --build-profile ${PROFILE} --status finished`;
  const list = eas(
    `build:list ${filters} --fingerprint-hash ${fingerprint} --limit 1 --json`,
    PROFILE,
  );
  const build = artifactOf(Array.isArray(list) ? (list[0] as BuildRecord) : undefined);
  if (build) return build;
  const latest = eas(`build:list ${filters} --limit 1 --json`, PROFILE);
  throw new Error(
    noMatchMessage(
      platform,
      fingerprint,
      artifactOf(Array.isArray(latest) ? (latest[0] as BuildRecord) : undefined),
    ),
  );
}

export async function resolveBuild(
  platform: DevicePlatform,
  override: string,
): Promise<Build & { fingerprint: string; source: 'override' | 'github' | 'eas' }> {
  const url = overrideFor(override, platform);
  if (url) return { url, id: 'override', fingerprint: 'override', source: 'override' };
  if (!process.env.EXPO_TOKEN) {
    throw new Error(`No ${platform} build_url given and no EXPO_TOKEN to compute the fingerprint`);
  }
  const fingerprint = nativeFingerprint(platform, PROFILE);
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository) {
    const fetchJson = githubApi(repository, process.env.GITHUB_TOKEN);
    const build = await githubBuild(platform, fingerprint, fetchJson);
    if (build) return { ...build, fingerprint, source: 'github' };
  }
  return { ...easBuild(platform, fingerprint), fingerprint, source: 'eas' };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { platform: { type: 'string' }, override: { type: 'string', default: '' } },
  });
  const platform = values.platform;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('--platform must be ios or android');
  }
  const build = await resolveBuild(platform, values.override);
  console.log(
    `${platform}: build ${build.id} from ${build.source} (fingerprint ${build.fingerprint})`,
  );
  const output = process.env.GITHUB_OUTPUT;
  const lines = `url=${build.url}\nbuild_id=${build.id}\nfingerprint=${build.fingerprint}\nsource=${build.source}\n`;
  if (output) appendFileSync(output, lines);
  else console.log(build.url);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `- ${platform} build: \`${build.id}\` (${build.source}, fingerprint \`${build.fingerprint}\`)\n`,
    );
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
