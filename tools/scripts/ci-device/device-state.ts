/**
 * What run-shard.ts does to the device around a flow: read it with adb, save its screen and log
 * after a failure, and stop the app before a flow runs again.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { flowAppId } from '../ui-qa-scan';
import type { DevicePlatform } from './plan-shards';

export function adb(serial: string, args: string[]): string {
  const result = spawnSync('adb', ['-s', serial, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : '';
}

/** The device's screen and the app's recent log after a failed flow, into `<out>/failures/`. */
export function captureFailure(
  platform: DevicePlatform,
  device: string,
  out: string,
  slug: string,
): void {
  const dir = path.join(out, 'failures');
  mkdirSync(dir, { recursive: true });
  const save = (file: string, command: string, args: string[]) => {
    const result = spawnSync(command, args, { maxBuffer: 256 * 1024 * 1024 });
    if (result.status === 0) writeFileSync(path.join(dir, file), result.stdout);
  };
  if (platform === 'android') {
    save(`${slug}.png`, 'adb', ['-s', device, 'exec-out', 'screencap', '-p']);
    save(`${slug}.logcat.txt`, 'adb', ['-s', device, 'logcat', '-d', '-b', 'all']);
    save(`${slug}.crash.txt`, 'adb', ['-s', device, 'logcat', '-d', '-b', 'crash']);
  } else {
    spawnSync('xcrun', ['simctl', 'io', device, 'screenshot', path.join(dir, `${slug}.png`)]);
    const predicate = 'process BEGINSWITH "CritterPass" OR subsystem == "com.facebook.react.log"';
    const logArgs = ['simctl', 'spawn', device, 'log', 'show', '--last', '10m'];
    save(`${slug}.log.txt`, 'xcrun', [...logArgs, '--style', 'compact', '--predicate', predicate]);
  }
}

/**
 * Stops the flow's app, so a flow that runs again starts it from a cold launch instead of the
 * screen the failed run left it on. The app's data stays: a flow that needs a fresh install clears
 * it itself.
 */
export function relaunchApp(platform: DevicePlatform, device: string, flow: string): void {
  const appId = flowAppId(readFileSync(flow, 'utf8'));
  if (!appId) return;
  if (platform === 'android') adb(device, ['shell', 'am', 'force-stop', appId]);
  else spawnSync('xcrun', ['simctl', 'terminate', device, appId]);
}

/** Serves ./runner-actions (push fixtures, network off/on) to the flows while they run. */
export function startRunnerActions(platform: DevicePlatform, device: string): () => void {
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      path.join(import.meta.dirname, 'runner-actions.ts'),
      '--platform',
      platform,
      '--device',
      device,
    ],
    { stdio: 'inherit', env: process.env },
  );
  return () => child.kill();
}
