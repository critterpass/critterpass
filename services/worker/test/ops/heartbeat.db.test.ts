/**
 * Worker heartbeat over a real Redis: each instance keeps its own key alive with a TTL and joins
 * the instance set; two instances beating are two keys the jobs panel counts.
 */
import { startRedis } from '@cp/db/testing';
import {
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '@cp/domain';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { beat, startWorkerHeartbeat, workerInstanceId } from '../../src/boss/heartbeat';

let stop: () => Promise<unknown>;
let redis: RedisClientType;

beforeAll(async () => {
  const container = await startRedis();
  stop = () => container.stop();
  redis = createClient({ url: container.getConnectionUrl() });
  await redis.connect();
}, 240_000);

afterAll(async () => {
  redis?.destroy();
  await stop?.();
});

describe('worker heartbeat', () => {
  it('writes one expiring key per instance and joins the instance set', async () => {
    const now = new Date('2026-09-28T09:00:00Z');
    await beat(redis, 'worker-a', now);
    await beat(redis, 'worker-b', now);
    expect((await redis.sMembers(WORKER_HEARTBEAT_SET)).sort()).toEqual(['worker-a', 'worker-b']);
    const ttl = await redis.ttl(`${WORKER_HEARTBEAT_KEY_PREFIX}worker-a`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WORKER_HEARTBEAT_TTL_SECONDS);
    expect(JSON.parse((await redis.get(`${WORKER_HEARTBEAT_KEY_PREFIX}worker-b`)) ?? '{}')).toEqual(
      { instance: 'worker-b', at: now.toISOString() },
    );
  });

  it('beats on start and stops cleanly', async () => {
    const warnings: unknown[] = [];
    const logger = {
      info: () => undefined,
      warn: (d: object) => warnings.push(d),
      error: () => undefined,
    };
    const stopBeat = startWorkerHeartbeat(redis, logger, 'worker-c');
    await expect.poll(() => redis.exists(`${WORKER_HEARTBEAT_KEY_PREFIX}worker-c`)).toBe(1);
    stopBeat();
    expect(warnings).toEqual([]);
    expect(workerInstanceId({ RAILWAY_REPLICA_ID: 'replica-1' })).toBe('replica-1');
  });
});
