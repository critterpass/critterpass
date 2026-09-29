/**
 * An Android emulator with the e2e-test APK installed, for `screens:capture --platform android`.
 *
 * Reuses an emulator that is already running (and leaves it running); otherwise boots the `device`
 * AVD headless and shuts it down again in `dispose`. The app's `[ui-qa]` reports are read from
 * logcat (its `console.warn` lines under the `ReactNativeJS` tag): a release APK is not debuggable,
 * so its documents folder can't be read back the way a simulator container can.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { download, run, type CaptureDevice } from './capture-process';

const SDK = process.env.ANDROID_HOME ?? path.join(homedir(), 'Library/Android/sdk');
const ADB = path.join(SDK, 'platform-tools/adb');
const EMULATOR = path.join(SDK, 'emulator/emulator');
const BOOT_TIMEOUT_MS = 300_000;

/** Serials of the emulators `adb devices` lists as ready. */
export function emulatorSerials(adbDevices: string): string[] {
  return adbDevices
    .split('\n')
    .map((line) => /^(emulator-\d+)\s+device\b/.exec(line.trim())?.[1])
    .filter((serial): serial is string => serial !== undefined);
}

/** A SystemUI demo-mode command, as `adb shell` arguments. */
function demo(command: string, ...extras: string[]): string[] {
  return [
    'am',
    'broadcast',
    '-a',
    'com.android.systemui.demo',
    '-e',
    'command',
    command,
    ...extras,
  ];
}

/** The broadcasts that pin SystemUI's demo-mode status bar to 9:41, full battery and full signal. */
export function demoStatusBar(): string[][] {
  return [
    demo('enter'),
    demo('clock', '-e', 'hhmm', '0941'),
    demo('battery', '-e', 'level', '100', '-e', 'plugged', 'false'),
    demo('network', '-e', 'wifi', 'show', '-e', 'level', '4'),
    demo('network', '-e', 'mobile', 'show', '-e', 'level', '4', '-e', 'datatype', 'none'),
    demo('notifications', '-e', 'visible', 'false'),
  ];
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function adb(serial: string, ...args: string[]): string {
  return run(ADB, ['-s', serial, ...args]);
}

async function bootEmulator(avd: string): Promise<string> {
  const before = new Set(emulatorSerials(run(ADB, ['devices'])));
  const child = spawn(EMULATOR, ['-avd', avd, '-no-snapshot-save', '-no-audio', '-no-boot-anim'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await pause(3000);
    const serial = emulatorSerials(run(ADB, ['devices'])).find((each) => !before.has(each));
    if (serial && adb(serial, 'shell', 'getprop', 'sys.boot_completed').trim() === '1') {
      return serial;
    }
  }
  throw new Error(`The ${avd} emulator did not boot within ${String(BOOT_TIMEOUT_MS / 1000)} s`);
}

/**
 * Downloads the APK into `workDir`, installs it on a running emulator (or boots the `device` AVD)
 * and pins appearance and the status bar for stable screenshots.
 */
export async function openAndroidDevice(
  apkUrl: string,
  workDir: string,
  device: string,
  dark: boolean,
  track: (device: CaptureDevice) => void,
): Promise<CaptureDevice> {
  const apk = path.join(workDir, 'app.apk');
  await download(apkUrl, apk);
  const running = emulatorSerials(run(ADB, ['devices']))[0];
  const serial = running ?? (await bootEmulator(device));
  console.log(`Emulator: ${serial}${running ? ' (already running)' : ` (${device})`}`);
  let disposed = false;
  const handle: CaptureDevice = {
    id: serial,
    // Maestro installs and starts its driver app on the emulator first; a busy Mac can pass the
    // two-minute default.
    maestroEnv: { MAESTRO_DRIVER_STARTUP_TIMEOUT: '360000' },
    readUiQa: () => {
      const log = adb(serial, 'logcat', '-d', '-v', 'raw', 'ReactNativeJS:W', '*:S');
      adb(serial, 'logcat', '-c');
      return log;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        if (running) adb(serial, 'shell', ...demo('exit'));
        else adb(serial, 'emu', 'kill');
      } catch {
        // The emulator is already gone.
      }
    },
  };
  track(handle);
  adb(serial, 'install', '-r', apk);
  rmSync(apk, { force: true });
  adb(serial, 'shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no');
  // A loaded emulator raises "isn't responding" dialogs for system apps over the app under test.
  adb(serial, 'shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1');
  adb(serial, 'shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1');
  for (const broadcast of demoStatusBar()) adb(serial, 'shell', ...broadcast);
  adb(serial, 'logcat', '-c');
  return handle;
}
