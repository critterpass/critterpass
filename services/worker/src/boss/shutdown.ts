/**
 * Graceful stop: workers stop fetching at once, jobs already running get `timeoutMs` to finish,
 * and any still running after that are failed back to their queue by pg-boss ("shut down while
 * active") so another instance retries them. Crons and maintenance stop with the instance.
 */
import type { PgBoss } from 'pg-boss';

export const DEFAULT_STOP_TIMEOUT_MS = 20_000;

const stopping = new WeakMap<PgBoss, Promise<void>>();

async function stopOnce(boss: PgBoss, timeoutMs: number): Promise<void> {
  const stopped = new Promise<void>((resolve) => boss.once('stopped', () => resolve()));
  await boss.stop({ graceful: true, close: true, timeout: timeoutMs });
  await stopped;
}

/** Stops `boss`; a second call (another shutdown path) waits for the first instead of hanging. */
export function stopJobRuntime(
  boss: PgBoss,
  timeoutMs: number = DEFAULT_STOP_TIMEOUT_MS,
): Promise<void> {
  let pending = stopping.get(boss);
  if (pending === undefined) {
    pending = stopOnce(boss, timeoutMs);
    stopping.set(boss, pending);
  }
  return pending;
}
