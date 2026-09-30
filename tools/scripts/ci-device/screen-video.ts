/**
 * Records the device screen while one flow runs, for the release gate's videos.
 *
 * Android: `screenrecord` stops itself after three minutes, so a shell loop on the device records
 * back-to-back segments into /sdcard/cp-video/ until a stop file appears; stopping interrupts the
 * current segment (SIGINT lets it finish its file) and pulls every segment into `<dir>/`. The
 * release gate's report joins them (./release-gate). iOS: `simctl io recordVideo` has no limit and
 * writes one file, finished on SIGINT.
 *
 * Flows run through a blocking `spawnSync`, so nothing here relies on the event loop: the recorder
 * runs in its own process and `stop()` waits synchronously.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { DevicePlatform } from './plan-shards';

const REMOTE_DIR = '/sdcard/cp-video';
/** A third of the Pixel 7's 1080×2400, the report's own size: the emulator encodes in software, so a smaller picture leaves the app its CPU. */
const ANDROID_SIZE = '360x800';
const ANDROID_BIT_RATE = '1000000';

export interface ScreenRecorder {
  /** Stops recording and returns the recorded files in order (empty when nothing was recorded). */
  stop(): string[];
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The device-side loop that records segments until `<dir>/stop` exists. */
export function androidRecordLoop(): string {
  return [
    `rm -rf ${REMOTE_DIR}; mkdir -p ${REMOTE_DIR}; i=100;`,
    `while [ ! -f ${REMOTE_DIR}/stop ]; do`,
    `screenrecord --size ${ANDROID_SIZE} --bit-rate ${ANDROID_BIT_RATE} --time-limit 180 ${REMOTE_DIR}/seg-$i.mp4;`,
    'i=$((i+1)); done',
  ].join(' ');
}

/** Segment files in recording order (the loop numbers them from 100, so names sort). */
export function segmentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^seg-\d+\.mp4$/.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

function startAndroid(serial: string, dir: string): ScreenRecorder {
  const child = spawn('adb', ['-s', serial, 'shell', androidRecordLoop()], { stdio: 'ignore' });
  return {
    stop() {
      const shell = (command: string) =>
        spawnSync('adb', ['-s', serial, 'shell', command], { encoding: 'utf8' });
      shell(`touch ${REMOTE_DIR}/stop; pkill -INT screenrecord`);
      for (let i = 0; i < 20 && shell('pidof screenrecord').stdout.trim() !== ''; i++) sleep(500);
      child.kill();
      mkdirSync(dir, { recursive: true });
      const listed = shell(`ls ${REMOTE_DIR}`).stdout.split(/\s+/);
      for (const name of listed.filter((file) => /^seg-\d+\.mp4$/.test(file)))
        spawnSync('adb', ['-s', serial, 'pull', `${REMOTE_DIR}/${name}`, path.join(dir, name)]);
      shell(`rm -rf ${REMOTE_DIR}`);
      return segmentFiles(dir);
    },
  };
}

function startIos(udid: string, dir: string): ScreenRecorder {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'seg-100.mp4');
  const child = spawn(
    'xcrun',
    ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', file],
    { stdio: 'ignore' },
  );
  return {
    stop() {
      child.kill('SIGINT');
      const alive = () => {
        try {
          return child.pid !== undefined && process.kill(child.pid, 0);
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 30 && alive(); i++) sleep(500);
      return segmentFiles(dir);
    },
  };
}

/** Starts recording `device`'s screen into `dir`. */
export function startScreenRecorder(
  platform: DevicePlatform,
  device: string,
  dir: string,
): ScreenRecorder {
  return platform === 'android' ? startAndroid(device, dir) : startIos(device, dir);
}
