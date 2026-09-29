/**
 * Captures real device screenshots of the mobile app for pull requests.
 *
 *   pnpm screens:capture -- --flows e2e/screens/*.yaml --out ./screens [--dark]
 *     [--platform ios|android] [--device "iPhone 17" | --device cp_pixel_api36]
 *
 * Reuses the finished `e2e-test` build for the project's current native fingerprint on that
 * platform (never starts an EAS build: builds cost money), republishes the current JS to the
 * `e2e-test` channel exactly like the cloud e2e workflow does (that variant loads the update before
 * its first render), then runs each Maestro flow locally and collects every `takeScreenshot` PNG
 * into --out. iOS runs on a throwaway simulator of the `--device` type; Android runs on the emulator
 * that is already running, or boots the `--device` AVD for the run. The app's runtime UI checks
 * (`[ui-qa]` reports: truncated headlines, words split across lines, critters without their sticker
 * edge) are collected after every flow into --out/ui-qa.log, and any report fails the run. What the
 * run created (simulator, booted emulator, downloads) is always removed, including on failure or
 * Ctrl-C.
 */
import type { SpawnSyncOptions } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { openAndroidDevice } from './capture-android-device';
import { flowScreenshotNames, planCopies, type FlowScreens } from './capture-flow-shots';
import { openIosDevice } from './capture-ios-device';
import { run, type CaptureDevice } from './capture-process';
import { CliArgsError } from './e2e-cloud';
import { failOnUiQa, recordFlowUiQa, type UiQaReport } from './ui-qa-scan';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const MOBILE_DIR = path.join(REPO_ROOT, 'apps/mobile');
const MAESTRO = path.join(homedir(), '.maestro/bin/maestro');
const PROFILE = 'e2e-test';
const PLATFORMS = ['ios', 'android'] as const;
export type CapturePlatform = (typeof PLATFORMS)[number];
const DEFAULT_DEVICE: Record<CapturePlatform, string> = {
  ios: 'iPhone 17',
  android: 'cp_pixel_api36',
};

export interface CaptureOptions {
  /** Absolute paths of the Maestro flow files or directories to run, in order. */
  flows: string[];
  /** Absolute output directory for the collected PNGs. */
  out: string;
  dark: boolean;
  /** iOS: a simulator device type. Android: the AVD to boot when no emulator is running. */
  device: string;
  /** Defaults to iOS. */
  platform?: CapturePlatform;
}

/** Pure arg parsing. Shell globs expand `--flows e2e/screens/*.yaml` into trailing positionals. */
export function parseCaptureArgs(argv: string[], baseDir: string): CaptureOptions {
  const args = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      flows: { type: 'string', multiple: true },
      out: { type: 'string' },
      dark: { type: 'boolean', default: false },
      device: { type: 'string' },
      platform: { type: 'string', default: 'ios' },
    },
  });
  const platform = values.platform as CapturePlatform;
  if (!PLATFORMS.includes(platform)) {
    throw new CliArgsError(`--platform must be one of ${PLATFORMS.join(', ')}, got "${platform}"`);
  }
  const flows = [...(values.flows ?? []), ...positionals];
  if (flows.length === 0)
    throw new CliArgsError('--flows is required (Maestro flow files or directories)');
  if (!values.out) throw new CliArgsError('--out is required (directory for the screenshots)');
  return {
    flows: flows.map((flow) => path.resolve(baseDir, flow)),
    out: path.resolve(baseDir, values.out),
    dark: values.dark,
    device: values.device ?? DEFAULT_DEVICE[platform],
    platform,
  };
}

/** Expands directories into their `*.yaml` flows (sorted); rejects anything else. Order is kept, duplicates dropped. */
export function resolveFlowFiles(flows: string[]): string[] {
  const files = flows.flatMap((flow) => {
    if (!existsSync(flow)) throw new CliArgsError(`Flow not found: ${flow}`);
    if (statSync(flow).isDirectory()) {
      return readdirSync(flow)
        .filter((name) => /\.ya?ml$/.test(name))
        .sort()
        .map((name) => path.join(flow, name));
    }
    if (!/\.ya?ml$/.test(flow)) throw new CliArgsError(`Not a Maestro flow (.yaml): ${flow}`);
    return [flow];
  });
  if (files.length === 0) throw new CliArgsError('No Maestro flows found in --flows');
  return [...new Set(files)];
}

export { planCopies, screenshotNames, type FlowScreens } from './capture-flow-shots';

export { hostApp, pickIosRuntime, type SimRuntime } from './capture-ios-device';

/** Parses eas-cli `--json` output, which can be preceded by plain-text environment notices. */
export function parseEasJson(stdout: string): unknown {
  const start = stdout.search(/^[[{]/m);
  if (start < 0) throw new Error(`eas-cli produced no JSON output: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
}

/**
 * eas-cli in apps/mobile, as the `development` variant the e2e-test profile ships. pnpm scripts export
 * a NODE_PATH into its virtual store, which makes react-native-web resolvable and adds `web` to the
 * Expo config, so the fingerprint would never match the cloud one; the child runs without it.
 */
function eas(command: string, extra: string[] = [], options: SpawnSyncOptions = {}): string {
  const { NODE_PATH: _nodePath, ...inherited } = process.env;
  const env = { ...inherited, APP_VARIANT: 'development' };
  const args = ['--yes', 'eas-cli', ...command.split(' '), ...extra];
  return run('npx', args, { cwd: MOBILE_DIR, env, ...options });
}

/** Same fingerprint the cloud workflow's `fingerprint` job computes (environment: development). */
function nativeFingerprint(platform: CapturePlatform): string {
  const out = eas(`fingerprint:generate --platform ${platform} --environment development --json`);
  const hash = (parseEasJson(out) as { hash?: unknown }).hash;
  if (typeof hash !== 'string') throw new Error('eas fingerprint:generate returned no hash');
  return hash;
}

type BuildRecord = { id?: unknown; artifacts?: Record<string, unknown> } | undefined;

/** Mirrors the workflow's `get-build` job: the latest finished e2e-test build for a fingerprint. */
function findBuild(
  platform: CapturePlatform,
  fingerprint: string,
): { id: string; archiveUrl: string } | undefined {
  const filters = `--platform ${platform} --build-profile ${PROFILE} --status finished`;
  const out = eas(`build:list ${filters} --fingerprint-hash ${fingerprint} --limit 1 --json`);
  const builds = parseEasJson(out);
  const build = Array.isArray(builds) ? (builds[0] as BuildRecord) : undefined;
  const url = build?.artifacts?.applicationArchiveUrl ?? build?.artifacts?.buildUrl;
  if (!build || typeof build.id !== 'string' || typeof url !== 'string') return undefined;
  return { id: build.id, archiveUrl: url };
}

/** Mirrors the workflow's `publish_update` job so the reused build runs the current JS. */
function publishCurrentJs(platform: CapturePlatform, fingerprint: string): void {
  const update = `update --channel ${PROFILE} --platform ${platform} --environment development`;
  const message = `screenshot freshness for fingerprint ${fingerprint}`;
  eas(update, ['--non-interactive', '--message', message], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/** Runs the flows and writes their screenshots (and ui-qa.log) to `options.out`. */
export async function capture(options: CaptureOptions): Promise<void> {
  const flows = resolveFlowFiles(options.flows);
  if (!existsSync(MAESTRO)) throw new Error(`Maestro not found at ${MAESTRO}`);

  const platform = options.platform ?? 'ios';
  const label = platform === 'ios' ? 'iOS' : 'Android';

  console.log(`Computing the ${label} native fingerprint…`);
  const fingerprint = nativeFingerprint(platform);
  const build = findBuild(platform, fingerprint);
  if (!build) {
    throw new Error(
      `No finished ${label} "${PROFILE}" build matches the current fingerprint ${fingerprint}.\n` +
        'This script never starts an EAS build; one has to be run for this fingerprint first.',
    );
  }
  console.log(`Using build ${build.id} (fingerprint ${fingerprint}). Publishing the current JS…`);
  publishCurrentJs(platform, fingerprint);

  const workDir = mkdtempSync(path.join(tmpdir(), 'cp-screens-'));
  let device: CaptureDevice | undefined;
  const cleanup = () => {
    device?.dispose();
    rmSync(workDir, { recursive: true, force: true });
  };
  const onSignal = () => {
    cleanup();
    process.exit(130);
  };
  process.once('SIGINT', onSignal).once('SIGTERM', onSignal);
  try {
    const open = platform === 'ios' ? openIosDevice : openAndroidDevice;
    const track = (opened: CaptureDevice) => {
      device = opened;
    };
    const target = await open(build.archiveUrl, workDir, options.device, options.dark, track);

    const failed: string[] = [];
    const uiQa = new Map<string, UiQaReport[]>();
    const results: FlowScreens[] = flows.map((flow, index) => {
      const dir = path.join(workDir, `flow-${String(index)}`);
      mkdirSync(dir);
      console.log(`Running ${path.relative(REPO_ROOT, flow)}…`);
      try {
        run(MAESTRO, ['--device', target.id, 'test', flow], {
          cwd: dir,
          env: { ...process.env, ...target.maestroEnv },
          stdio: ['ignore', 'inherit', 'inherit'],
        });
      } catch {
        failed.push(path.relative(REPO_ROOT, flow));
      }
      recordFlowUiQa(uiQa, flow, target.readUiQa);
      return { flow, dir, names: flowScreenshotNames(flow, dir) };
    });

    mkdirSync(options.out, { recursive: true });
    const missing: string[] = [];
    for (const { from, to } of planCopies(results, options.out)) {
      if (!existsSync(from)) {
        missing.push(path.basename(to));
        continue;
      }
      copyFileSync(from, to);
      console.log(`  ${to}`);
    }
    // Screenshots from flows that did pass are kept; a failing flow still fails the command.
    if (failed.length > 0) throw new Error(`Maestro flow(s) failed: ${failed.join(', ')}`);
    if (missing.length > 0) throw new Error(`Screenshots not written: ${missing.join(', ')}`);
    failOnUiQa(uiQa, options.out);
  } finally {
    cleanup();
    process.off('SIGINT', onSignal).off('SIGTERM', onSignal);
  }
}

async function main(): Promise<void> {
  let options: CaptureOptions;
  try {
    options = parseCaptureArgs(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  try {
    await capture(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  void main();
}
