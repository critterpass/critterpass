/**
 * Finds the EAS e2e-test build a device run installs, for one platform.
 *
 *   tsx tools/scripts/ci-device/resolve-build.ts --platform ios [--override "<url> <url>"]
 *
 * An override (the workflow's `build_url` input: one or two artifact URLs, `.apk` for Android,
 * anything else for iOS) wins. Otherwise, like `pnpm screens:capture`, it computes the native
 * fingerprint (environment: development) and takes the latest finished e2e-test build for it; that
 * needs EXPO_TOKEN. It never starts a build. Writes `url`, `build_id` and `fingerprint` to the step
 * outputs on GitHub Actions.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { parseEasJson } from '../capture-app-screens';
import type { DevicePlatform } from './plan-shards';

const MOBILE_DIR = path.resolve(import.meta.dirname, '../../../apps/mobile');
const PROFILE = 'e2e-test';

/** The override URL meant for `platform`, from a space- or comma-separated list. */
export function overrideFor(input: string, platform: DevicePlatform): string | undefined {
  const urls = input.split(/[\s,]+/).filter(Boolean);
  const isApk = (url: string) => /\.apk(?:$|[?#])/.test(url);
  return urls.find((url) => (platform === 'android' ? isApk(url) : !isApk(url)));
}

type BuildRecord = { id?: unknown; artifacts?: Record<string, unknown> };

/** The installable artifact of an `eas build:list --json` entry. */
export function artifactOf(
  build: BuildRecord | undefined,
): { id: string; url: string } | undefined {
  const url = build?.artifacts?.applicationArchiveUrl ?? build?.artifacts?.buildUrl;
  if (!build || typeof build.id !== 'string' || typeof url !== 'string') return undefined;
  return { id: build.id, url };
}

/** eas-cli in apps/mobile as the development variant the e2e-test profile ships. */
function eas(args: string): unknown {
  const { NODE_PATH: _nodePath, ...inherited } = process.env;
  const cli = process.env.EAS_CLI ?? 'eas-cli';
  const result = spawnSync('npx', ['--yes', cli, ...args.split(' ')], {
    cwd: MOBILE_DIR,
    env: { ...inherited, APP_VARIANT: 'development' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`eas ${args.split(' ')[0] ?? ''} failed`);
  return parseEasJson(result.stdout);
}

export function resolveBuild(
  platform: DevicePlatform,
  override: string,
): { url: string; id: string; fingerprint: string } {
  const url = overrideFor(override, platform);
  if (url) return { url, id: 'override', fingerprint: 'override' };
  if (!process.env.EXPO_TOKEN) {
    throw new Error(`No ${platform} build_url given and no EXPO_TOKEN to look one up`);
  }
  const fp = eas(`fingerprint:generate --platform ${platform} --environment development --json`);
  const fingerprint = (fp as { hash?: unknown }).hash;
  if (typeof fingerprint !== 'string') throw new Error('eas fingerprint:generate returned no hash');
  const filters = `--platform ${platform} --build-profile ${PROFILE} --status finished`;
  const list = eas(`build:list ${filters} --fingerprint-hash ${fingerprint} --limit 1 --json`);
  const build = artifactOf(Array.isArray(list) ? (list[0] as BuildRecord) : undefined);
  if (!build) {
    throw new Error(
      `No finished ${platform} "${PROFILE}" build matches fingerprint ${fingerprint}. ` +
        'Device runs never start an EAS build; run one for this fingerprint or pass build_url.',
    );
  }
  return { url: build.url, id: build.id, fingerprint };
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { platform: { type: 'string' }, override: { type: 'string', default: '' } },
  });
  const platform = values.platform;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('--platform must be ios or android');
  }
  const build = resolveBuild(platform, values.override);
  console.log(`${platform}: build ${build.id} (fingerprint ${build.fingerprint})`);
  const output = process.env.GITHUB_OUTPUT;
  const lines = `url=${build.url}\nbuild_id=${build.id}\nfingerprint=${build.fingerprint}\n`;
  if (output) appendFileSync(output, lines);
  else console.log(build.url);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
