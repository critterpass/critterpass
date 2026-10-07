/**
 * The view hierarchy of the screen a flow ended on, saved as `<out>/hierarchy/<flow>.json`
 * (`maestro hierarchy`) for the accessibility scan, which reads tappable nodes, their names and
 * their frames. Android only: iOS hierarchies carry no tappable flag. Off unless
 * `SAVE_HIERARCHY=true`; it is an artifact and never fails a flow or a shard.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 120_000;

/** The hierarchy document in Maestro's output (notices may come before it), or null without one. */
export function hierarchyJson(stdout: string): string | null {
  const start = stdout.indexOf('{');
  if (start === -1) return null;
  const text = stdout.slice(start).trim();
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? text : null;
  } catch {
    return null;
  }
}

/** Saves the current screen's hierarchy; says so and carries on when Maestro gives none. */
export function saveHierarchy(maestro: string, device: string, file: string): void {
  if (process.env['SAVE_HIERARCHY'] !== 'true') return;
  const result = spawnSync(maestro, ['--device', device, 'hierarchy'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: TIMEOUT_MS,
  });
  const json = result.status === 0 ? hierarchyJson(result.stdout) : null;
  if (json === null) {
    console.log(`No view hierarchy for ${path.basename(file)} (maestro hierarchy gave none).`);
    return;
  }
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${json}\n`);
  } catch (error) {
    console.log(`View hierarchy not saved: ${error instanceof Error ? error.message : 'error'}`);
  }
}
