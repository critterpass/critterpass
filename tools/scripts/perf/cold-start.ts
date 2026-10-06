/**
 * Cold start: the median of several launches from a killed app. Android numbers come from
 * `adb shell am start -W` (`TotalTime`, launch to first frame drawn); iOS numbers are milliseconds,
 * one per line, as exported from the App Launch instrument by the device workflow.
 */
import { execFileSync } from 'node:child_process';

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Every `TotalTime: <ms>` in `am start -W` output (one per launch). */
export function parseAmStart(output: string): number[] {
  return [...output.matchAll(/^TotalTime:\s*(\d+)/gmu)].map((m) => Number(m[1]));
}

export function parseMsLines(text: string): number[] {
  return text
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Launches `pkg` cold `runs` times on the connected device and returns the raw output. */
export function measureAndroid(pkg: string, runs = 5): string {
  let output = '';
  for (let i = 0; i < runs; i += 1) {
    execFileSync('adb', ['shell', 'am', 'force-stop', pkg]);
    output += execFileSync('adb', ['shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`], {
      encoding: 'utf8',
    });
  }
  return output;
}
