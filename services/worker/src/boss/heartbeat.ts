/**
 * Worker heartbeat: every 10 s each instance writes `worker:heartbeat:<instance>` with a 30 s TTL
 * and joins the `worker:heartbeats` set, so the console's jobs panel counts live workers (a key
 * that expired is a worker that stopped). A failed write is logged and retried on the next beat.
 */
import { hostname } from 'node:os';

import {
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '@cp/domain';

import type { JobLogger } from './define-job';

export interface HeartbeatRedis {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  sAdd(key: string, member: string): Promise<unknown>;
}

export const HEARTBEAT_INTERVAL_MS = 10_000;

/** Railway's replica id where it runs, else host and pid. */
export function workerInstanceId(env: NodeJS.ProcessEnv = process.env): string {
  return env['RAILWAY_REPLICA_ID'] ?? `${hostname()}:${process.pid}`;
}

export async function beat(redis: HeartbeatRedis, instance: string, now: Date): Promise<void> {
  await redis.set(
    `${WORKER_HEARTBEAT_KEY_PREFIX}${instance}`,
    JSON.stringify({ instance, at: now.toISOString() }),
    { EX: WORKER_HEARTBEAT_TTL_SECONDS },
  );
  await redis.sAdd(WORKER_HEARTBEAT_SET, instance);
}

/** Starts beating now and every 10 s; returns the stop function. */
export function startWorkerHeartbeat(
  redis: HeartbeatRedis,
  logger: JobLogger,
  instance: string = workerInstanceId(),
): () => void {
  const tick = () => {
    beat(redis, instance, new Date()).catch((error: unknown) =>
      logger.warn({ err: error }, 'worker heartbeat failed'),
    );
  };
  tick();
  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
