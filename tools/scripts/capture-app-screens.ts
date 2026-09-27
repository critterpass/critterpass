/**
 * Captures real iOS simulator screenshots of the mobile app for pull requests.
 *
 *   pnpm screens:capture -- --flows e2e/screens/*.yaml --out ./screens [--dark] [--device "iPhone 17"]
 *
 * Reuses the finished `e2e-test` iOS simulator build for the project's current native fingerprint
 * (never starts an EAS build: builds cost money), republishes the current JS to the `e2e-test`
 * channel exactly like the cloud e2e workflow does (that variant loads the update before its first
 * render), then runs each Maestro flow locally on a throwaway simulator and collects every
 * `takeScreenshot` PNG into --out. The simulator, the downloaded tarball and the extracted .app are
 * always removed, including on failure or Ctrl-C.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { CliArgsError } from './e2e-cloud';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const MOBILE_DIR = path.join(REPO_ROOT, 'apps/mobile');
const MAESTRO = path.join(homedir(), '.maestro/bin/maestro');
const PROFILE = 'e2e-test';
const DEFAULT_DEVICE = 'iPhone 17';

export interface CaptureOptions {
  /** Absolute paths of the Maestro flow files or directories to run, in order. */
  flows: string[];
  /** Absolute output directory for the collected PNGs. */
  out: string;
  dark: boolean;
  device: string;
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
    },
  });
  const flows = [...(values.flows ?? []), ...positionals];
  if (flows.length === 0)
    throw new CliArgsError('--flows is required (Maestro flow files or directories)');
  if (!values.out) throw new CliArgsError('--out is required (directory for the screenshots)');
  return {
    flows: flows.map((flow) => path.resolve(baseDir, flow)),
    out: path.resolve(baseDir, values.out),
    dark: values.dark,
    device: values.device ?? DEFAULT_DEVICE,
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

/** Screenshot names a flow takes, from `takeScreenshot: name` or `takeScreenshot:\n  path: name`. */
export function screenshotNames(flowYaml: string): string[] {
  const names: string[] = [];
  const lines = flowYaml.split('\n');
  lines.forEach((line, index) => {
    const match = /^\s*-?\s*takeScreenshot:\s*(.*)$/.exec(line);
    if (!match) return;
    let value = (match[1] ?? '').replace(/\s+#.*$/, '').trim();
    if (!value) value = /^\s*path:\s*(.+)$/.exec(lines[index + 1] ?? '')?.[1]?.trim() ?? '';
    value = value.replace(/^['"]|['"]$/g, '').replace(/\.png$/, '');
    if (value) names.push(value);
  });
  return names;
}

export interface FlowScreens {
  flow: string;
  /** Directory Maestro ran in (screenshots land relative to it). */
  dir: string;
  names: string[];
}

/** Maps each expected screenshot to its output file; names shared across flows get the flow name as prefix. */
export function planCopies(results: FlowScreens[], out: string): { from: string; to: string }[] {
  const counts = new Map<string, number>();
  for (const { names } of results)
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return results.flatMap(({ flow, dir, names }) =>
    names.map((name) => {
      const flowName = path.basename(flow).replace(/\.ya?ml$/, '');
      const file = (counts.get(name) ?? 0) > 1 ? `${flowName}-${name}.png` : `${name}.png`;
      return { from: path.join(dir, `${name}.png`), to: path.join(out, file) };
    }),
  );
}

export interface SimRuntime {
  identifier: string;
  version: string;
  platform?: string;
  isAvailable?: boolean;
}

/** Newest available iOS runtime from `xcrun simctl list runtimes -j`. */
export function pickIosRuntime(runtimes: SimRuntime[]): SimRuntime | undefined {
  return runtimes
    .filter((runtime) => runtime.isAvailable !== false && (runtime.platform ?? 'iOS') === 'iOS')
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))[0];
}

/** Parses eas-cli `--json` output, which can be preceded by plain-text environment notices. */
export function parseEasJson(stdout: string): unknown {
  const start = stdout.search(/^[[{]/m);
  if (start < 0) throw new Error(`eas-cli produced no JSON output: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  const label = `${command} ${args.slice(0, 3).join(' ')}`;
  if (result.status !== 0) throw new Error(`${label} failed (exit ${String(result.status)})`);
  return typeof result.stdout === 'string' ? result.stdout : '';
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
function iosFingerprint(): string {
  const out = eas('fingerprint:generate --platform ios --environment development --json');
  const hash = (parseEasJson(out) as { hash?: unknown }).hash;
  if (typeof hash !== 'string') throw new Error('eas fingerprint:generate returned no hash');
  return hash;
}

type BuildRecord = { id?: unknown; artifacts?: Record<string, unknown> } | undefined;

/** Mirrors the workflow's `get-build` job: the latest finished e2e-test iOS build for a fingerprint. */
function findBuild(fingerprint: string): { id: string; archiveUrl: string } | undefined {
  const filters = `--platform ios --build-profile ${PROFILE} --status finished`;
  const out = eas(`build:list ${filters} --fingerprint-hash ${fingerprint} --limit 1 --json`);
  const builds = parseEasJson(out);
  const build = Array.isArray(builds) ? (builds[0] as BuildRecord) : undefined;
  const url = build?.artifacts?.applicationArchiveUrl ?? build?.artifacts?.buildUrl;
  if (!build || typeof build.id !== 'string' || typeof url !== 'string') return undefined;
  return { id: build.id, archiveUrl: url };
}

/** Mirrors the workflow's `publish_update` job so the reused build runs the current JS. */
function publishCurrentJs(fingerprint: string): void {
  const update = `update --channel ${PROFILE} --platform ios --environment development`;
  const message = `screenshot freshness for fingerprint ${fingerprint}`;
  eas(update, ['--non-interactive', '--message', message], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

async function downloadApp(url: string, workDir: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Build download failed: HTTP ${String(response.status)}`);
  const tarball = path.join(workDir, 'build.tar.gz');
  writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
  const extractDir = path.join(workDir, 'app');
  mkdirSync(extractDir);
  run('tar', ['-xzf', tarball, '-C', extractDir]);
  rmSync(tarball, { force: true });
  const app = hostApp(extractDir);
  if (!app) throw new Error('The build archive contains no .app bundle');
  return app;
}

/**
 * The installable app in an extracted simulator archive. A build with an App Clip archives the
 * whole products folder (`Release-iphonesimulator/` with the app and the clip side by side); the
 * clip is the bundle another candidate embeds under `AppClips/`.
 */
export function hostApp(extractDir: string): string | undefined {
  const entries = (dir: string) => readdirSync(dir).map((name) => path.join(dir, name));
  const top = entries(extractDir);
  const nested = top.filter((entry) => !entry.endsWith('.app') && statSync(entry).isDirectory());
  const apps = [...top, ...nested.flatMap(entries)].filter((entry) => entry.endsWith('.app'));
  const embedded = (app: string) =>
    apps.some((other) => existsSync(path.join(other, 'AppClips', path.basename(app))));
  return apps.find((app) => !embedded(app));
}

function createSimulator(device: string): string {
  const { runtimes } = JSON.parse(run('xcrun', ['simctl', 'list', 'runtimes', '-j'])) as {
    runtimes: SimRuntime[];
  };
  const runtime = pickIosRuntime(runtimes);
  if (!runtime)
    throw new Error('No iOS simulator runtime is installed (Xcode > Settings > Components)');
  const udid = run('xcrun', [
    'simctl',
    'create',
    `CritterPass screens ${String(process.pid)}`,
    device,
    runtime.identifier,
  ]).trim();
  console.log(`Simulator: ${device}, iOS ${runtime.version} (${udid})`);
  return udid;
}

function prepareSimulator(udid: string, appPath: string, dark: boolean): void {
  run('xcrun', ['simctl', 'boot', udid]);
  run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: ['ignore', 'ignore', 'inherit'] });
  run('xcrun', ['simctl', 'ui', udid, 'appearance', dark ? 'dark' : 'light']);
  const bar = ['--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100'];
  const radios = [
    '--cellularMode',
    'active',
    '--cellularBars',
    '4',
    '--wifiMode',
    'active',
    '--wifiBars',
    '3',
    '--dataNetwork',
    'wifi',
  ];
  run('xcrun', ['simctl', 'status_bar', udid, 'override', ...bar, ...radios]);
  run('xcrun', ['simctl', 'install', udid, appPath]);
}

function cleanup(udid: string | undefined, workDir: string): void {
  if (udid) {
    spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
    spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
  }
  rmSync(workDir, { recursive: true, force: true });
}

async function capture(options: CaptureOptions): Promise<void> {
  const flows = resolveFlowFiles(options.flows);
  if (!existsSync(MAESTRO)) throw new Error(`Maestro not found at ${MAESTRO}`);

  console.log('Computing the iOS native fingerprint…');
  const fingerprint = iosFingerprint();
  const build = findBuild(fingerprint);
  if (!build) {
    throw new Error(
      `No finished iOS "${PROFILE}" build matches the current fingerprint ${fingerprint}.\n` +
        'This script never starts an EAS build; one has to be run for this fingerprint first.',
    );
  }
  console.log(`Using build ${build.id} (fingerprint ${fingerprint}). Publishing the current JS…`);
  publishCurrentJs(fingerprint);

  const workDir = mkdtempSync(path.join(tmpdir(), 'cp-screens-'));
  let udid: string | undefined;
  const onSignal = () => {
    cleanup(udid, workDir);
    process.exit(130);
  };
  process.once('SIGINT', onSignal).once('SIGTERM', onSignal);
  try {
    const appPath = await downloadApp(build.archiveUrl, workDir);
    udid = createSimulator(options.device);
    prepareSimulator(udid, appPath, options.dark);

    const failed: string[] = [];
    const results: FlowScreens[] = flows.map((flow, index) => {
      const dir = path.join(workDir, `flow-${String(index)}`);
      mkdirSync(dir);
      console.log(`Running ${path.relative(REPO_ROOT, flow)}…`);
      try {
        run(MAESTRO, ['--device', udid ?? '', 'test', flow], {
          cwd: dir,
          // A fresh simulator installs and launches the XCTest driver first; on a busy Mac that alone
          // can pass Maestro's two-minute default.
          env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: '360000' },
          stdio: ['ignore', 'inherit', 'inherit'],
        });
      } catch {
        failed.push(path.relative(REPO_ROOT, flow));
      }
      return { flow, dir, names: screenshotNames(readFileSync(flow, 'utf8')) };
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
  } finally {
    cleanup(udid, workDir);
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
