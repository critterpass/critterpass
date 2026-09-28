/** A throwaway iOS simulator with the e2e-test simulator build installed, for `screens:capture`. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import { download, run, type CaptureDevice } from './capture-process';
import { pullUiQaLog } from './ui-qa-scan';

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

async function downloadApp(url: string, workDir: string): Promise<string> {
  const tarball = path.join(workDir, 'build.tar.gz');
  await download(url, tarball);
  const extractDir = path.join(workDir, 'app');
  mkdirSync(extractDir);
  run('tar', ['-xzf', tarball, '-C', extractDir]);
  rmSync(tarball, { force: true });
  const app = hostApp(extractDir);
  if (!app) throw new Error('The build archive contains no .app bundle');
  return app;
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

/**
 * Downloads the simulator build into `workDir`, creates a simulator of the `device` type and
 * installs the app. `dispose` deletes the simulator; the caller removes `workDir`.
 */
export async function openIosDevice(
  archiveUrl: string,
  workDir: string,
  device: string,
  dark: boolean,
  track: (device: CaptureDevice) => void,
): Promise<CaptureDevice> {
  const appPath = await downloadApp(archiveUrl, workDir);
  const udid = createSimulator(device);
  let disposed = false;
  const handle: CaptureDevice = {
    id: udid,
    // A fresh simulator installs and launches the XCTest driver first; on a busy Mac that alone can
    // pass Maestro's two-minute default.
    maestroEnv: { MAESTRO_DRIVER_STARTUP_TIMEOUT: '360000' },
    readUiQa: (appId) => pullUiQaLog(udid, appId),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
      spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
    },
  };
  track(handle);
  prepareSimulator(udid, appPath, dark);
  return handle;
}
