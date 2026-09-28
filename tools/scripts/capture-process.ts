/** Child-process helper shared by the screenshot capture scripts. */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/** Runs a command to completion and returns its stdout; throws on a non-zero exit. */
export function run(command: string, args: string[], options: SpawnSyncOptions = {}): string {
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

/** Downloads a build artifact to `file`. */
export async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Build download failed: HTTP ${String(response.status)}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** A device the capture runs Maestro flows on. */
export interface CaptureDevice {
  /** What `maestro --device` takes: a simulator udid or an adb serial. */
  readonly id: string;
  /** Environment Maestro needs for this platform. */
  readonly maestroEnv: Record<string, string>;
  /** Everything the app reported with `[ui-qa]` since the last read (the source is cleared). */
  readUiQa: (appId: string) => string;
  /** Removes what the capture created. Safe to call more than once. */
  dispose: () => void;
}
