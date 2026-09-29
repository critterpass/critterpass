/**
 * Turns an extracted e2e-test simulator build into one that runs this commit's JS, and nothing else.
 *
 *   tsx tools/scripts/ci-device/patch-ios-app.ts <extracted archive dir> <exported bundle dir>
 *
 * The bundle dir is `expo export:embed` output (`main.jsbundle` plus `assets/`). The host app's
 * `main.jsbundle` and assets are replaced, expo-updates is turned off in its Expo.plist (so the app
 * never downloads whatever was last published to the shared e2e-test channel and launches the
 * embedded JS), and the bundle is re-signed ad hoc (simulator entitlements live in the binary's
 * `__entitlements` section, so an ad-hoc signature keeps them). Prints the app's path.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';

import { hostApp } from '../capture-app-screens';

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed`);
}

/** The Expo.plist edits that make expo-updates launch the embedded bundle without any check. */
export const UPDATES_OFF: readonly (readonly [key: string, type: string, value: string])[] = [
  ['EXUpdatesEnabled', '-bool', 'NO'],
  ['EXUpdatesCheckOnLaunch', '-string', 'NEVER'],
];

export function patchIosApp(extractDir: string, bundleDir: string): string {
  const app = hostApp(extractDir);
  if (!app) throw new Error(`No .app in ${extractDir}`);
  const bundle = path.join(bundleDir, 'main.jsbundle');
  if (!existsSync(bundle)) throw new Error(`No main.jsbundle in ${bundleDir}`);
  copyFileSync(bundle, path.join(app, 'main.jsbundle'));
  const assets = path.join(bundleDir, 'assets');
  if (existsSync(assets)) cpSync(assets, path.join(app, 'assets'), { recursive: true });
  const plist = path.join(app, 'Expo.plist');
  for (const [key, type, value] of UPDATES_OFF)
    run('plutil', ['-replace', key, type, value, plist]);
  run('codesign', ['--force', '--sign', '-', '--timestamp=none', app]);
  run('codesign', ['--verify', '--deep', app]);
  return app;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  const [extractDir, bundleDir] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!extractDir || !bundleDir) {
    console.error('Usage: patch-ios-app <extracted archive dir> <exported bundle dir>');
    process.exitCode = 1;
  } else {
    try {
      console.log(patchIosApp(path.resolve(extractDir), path.resolve(bundleDir)));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
