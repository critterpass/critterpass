/**
 * Describes one native build made on a GitHub runner (`eas build --local`) and names the GitHub
 * release that carries it, so a device run can find the build for a native fingerprint.
 *
 *   tsx tools/scripts/ci-device/build-manifest.ts --profile e2e-test --platform android \
 *     --artifact <file> --run-id <id> --out <manifest.json>
 *
 * The manifest holds the profile, platform, native fingerprint, commit, app version, store build
 * number, the runtime version baked into the binary, the artifact's file name and the time. The
 * fingerprint is computed the way `eas update` and the device run compute it (eas-cli, the
 * profile's EAS environment); a store build whose baked runtime version differs from it could never
 * receive an update, so that fails the build. Writes `tag` and `fingerprint` to the step outputs.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { parseEasJson } from '../capture-app-screens';
import type { DevicePlatform } from './plan-shards';

const MOBILE_DIR = path.resolve(import.meta.dirname, '../../../apps/mobile');

export const BUILD_PROFILES = ['e2e-test', 'staging', 'production'] as const;
export type BuildProfile = (typeof BUILD_PROFILES)[number];

/** The EAS environment and app variant each eas.json build profile builds with. */
const PROFILE_SETTINGS: Record<BuildProfile, { environment: string; variant: string }> = {
  'e2e-test': { environment: 'development', variant: 'development' },
  staging: { environment: 'preview', variant: 'staging' },
  production: { environment: 'production', variant: 'production' },
};

export type BuildManifest = {
  profile: BuildProfile;
  platform: DevicePlatform;
  /** The native fingerprint hash (see {@link nativeFingerprint}). */
  fingerprint: string;
  commit: string;
  appVersion: string | null;
  buildNumber: string | null;
  /** The runtime version read back from the binary; null when it could not be read. */
  runtimeVersion: string | null;
  /** File name of the binary: a release asset for e2e-test builds, a run artifact otherwise. */
  artifact: string;
  runId: string;
  createdAt: string;
};

export function isBuildProfile(value: unknown): value is BuildProfile {
  return BUILD_PROFILES.some((profile) => profile === value);
}

/** Every release of one profile, platform and fingerprint starts with this tag prefix. */
export function releaseTagPrefix(
  profile: BuildProfile,
  platform: DevicePlatform,
  fingerprint: string,
): string {
  return `native-${profile}-${platform}-${fingerprint.slice(0, 12)}-`;
}

/** The manifest in a release body or manifest file; undefined when it is anything else. */
export function parseManifest(text: string | null | undefined): BuildManifest | undefined {
  if (!text) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const text_ = (key: string) => (typeof record[key] === 'string' ? record[key] : undefined);
  const nullable = (key: string) => text_(key) ?? null;
  const platform = record.platform;
  const fingerprint = text_('fingerprint');
  const commit = text_('commit');
  const artifact = text_('artifact');
  if (!isBuildProfile(record.profile) || (platform !== 'ios' && platform !== 'android')) {
    return undefined;
  }
  if (!fingerprint || !commit || !artifact) return undefined;
  return {
    profile: record.profile,
    platform,
    fingerprint,
    commit,
    appVersion: nullable('appVersion'),
    buildNumber: nullable('buildNumber'),
    runtimeVersion: nullable('runtimeVersion'),
    artifact,
    runId: text_('runId') ?? '',
    createdAt: text_('createdAt') ?? '',
  };
}

/** The hash in the `fingerprint` file expo-updates bakes into a binary (JSON or the bare hash). */
export function fingerprintFileHash(contents: string): string | undefined {
  const trimmed = contents.trim();
  if (!trimmed) return undefined;
  try {
    const hash = (JSON.parse(trimmed) as { hash?: unknown }).hash;
    return typeof hash === 'string' && hash ? hash : undefined;
  } catch {
    return /^[0-9a-f]{16,}$/i.test(trimmed) ? trimmed : undefined;
  }
}

/** Where a binary keeps the baked fingerprint, and the tool that reads it out. */
export function fingerprintFileCommand(artifact: string): [string, string[]] | undefined {
  if (artifact.endsWith('.apk')) return ['unzip', ['-p', artifact, 'assets/fingerprint']];
  if (artifact.endsWith('.aab')) return ['unzip', ['-p', artifact, 'base/assets/fingerprint']];
  if (artifact.endsWith('.ipa')) {
    return ['unzip', ['-p', artifact, 'Payload/*.app/EXUpdates.bundle/fingerprint']];
  }
  if (artifact.endsWith('.tar.gz')) {
    return ['tar', ['-xzOf', artifact, '*.app/EXUpdates.bundle/fingerprint']];
  }
  return undefined;
}

function bakedRuntimeVersion(artifact: string): string | undefined {
  const command = fingerprintFileCommand(artifact);
  if (!command) return undefined;
  const result = spawnSync(command[0], command[1], { encoding: 'utf8' });
  return result.status === 0 ? fingerprintFileHash(result.stdout) : undefined;
}

/**
 * eas-cli in apps/mobile as the profile's app variant. pnpm scripts export a NODE_PATH that adds
 * `web` to the Expo config and so changes the fingerprint; the child runs without it.
 */
export function eas(args: string, profile: BuildProfile, without: string[] = []): unknown {
  const { NODE_PATH: _nodePath, ...inherited } = process.env;
  for (const name of without) delete inherited[name];
  const cli = process.env.EAS_CLI ?? 'eas-cli';
  const result = spawnSync('npx', ['--yes', cli, ...args.split(' ')], {
    cwd: MOBILE_DIR,
    env: { ...inherited, APP_VARIANT: PROFILE_SETTINGS[profile].variant },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`eas ${args.split(' ')[0] ?? ''} failed`);
  return parseEasJson(result.stdout);
}

/**
 * The native fingerprint of the checked-out commit for one profile; needs EXPO_TOKEN.
 *
 * For a store profile it is the runtime version updates target, Firebase config included. For
 * e2e-test it is only the key device runs look a build up by, and they compute it in a job that
 * has no Firebase config (GitHub masks every line of that secret, which would blank the job's JSON
 * outputs), so the config is left out here too.
 */
export function nativeFingerprint(platform: DevicePlatform, profile: BuildProfile): string {
  const { environment } = PROFILE_SETTINGS[profile];
  const result = eas(
    `fingerprint:generate --platform ${platform} --environment ${environment} --json`,
    profile,
    profile === 'e2e-test' ? ['GOOGLE_SERVICES_JSON'] : [],
  );
  const hash = (result as { hash?: unknown }).hash;
  if (typeof hash !== 'string') throw new Error('eas fingerprint:generate returned no hash');
  return hash;
}

/** The store build number eas-cli keeps remotely; null for profiles that never set one. */
function remoteBuildNumber(platform: DevicePlatform, profile: BuildProfile): string | null {
  if (profile === 'e2e-test') return null;
  try {
    const result = eas(
      `build:version:get --platform ${platform} --profile ${profile} --json --non-interactive`,
      profile,
    ) as Record<string, unknown>;
    const value = result.buildNumber ?? result.versionCode;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  } catch {
    return null;
  }
}

function appVersion(profile: BuildProfile): string | null {
  const result = spawnSync('npx', ['expo', 'config', '--json'], {
    cwd: MOBILE_DIR,
    env: { ...process.env, APP_VARIANT: PROFILE_SETTINGS[profile].variant },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  try {
    const version = (parseEasJson(result.stdout) as { version?: unknown }).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      profile: { type: 'string' },
      platform: { type: 'string' },
      artifact: { type: 'string' },
      'run-id': { type: 'string', default: '' },
      out: { type: 'string' },
    },
  });
  const { profile, platform, artifact, out } = values;
  if (!isBuildProfile(profile)) throw new Error(`--profile must be ${BUILD_PROFILES.join(', ')}`);
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('--platform must be ios or android');
  }
  if (!artifact || !out) throw new Error('--artifact and --out are required');

  const fingerprint = nativeFingerprint(platform, profile);
  const runtimeVersion = bakedRuntimeVersion(artifact) ?? null;
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const manifest: BuildManifest = {
    profile,
    platform,
    fingerprint,
    commit,
    appVersion: appVersion(profile),
    buildNumber: remoteBuildNumber(platform, profile),
    runtimeVersion,
    artifact: path.basename(artifact),
    runId: values['run-id'],
    createdAt: new Date().toISOString(),
  };
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));

  const tag = `${releaseTagPrefix(profile, platform, fingerprint)}${values['run-id']}`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nfingerprint=${fingerprint}\n`);
  }
  if (runtimeVersion === null) {
    console.log('::warning::the runtime version baked into the binary could not be read');
  } else if (runtimeVersion !== fingerprint) {
    const message =
      `the binary's runtime version ${runtimeVersion} is not the fingerprint ${fingerprint} that ` +
      'eas-cli computes here: updates published from this commit would not reach this build';
    if (profile !== 'e2e-test') throw new Error(message);
    // Expected on Android (the lookup key leaves the Firebase config out), and harmless: device
    // runs swap their own JS into e2e-test builds, with updates off.
    console.log(`e2e-test: ${message}`);
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
