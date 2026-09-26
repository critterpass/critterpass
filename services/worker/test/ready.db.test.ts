import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHealthApp } from '../src/health';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
});

afterAll(async () => {
  await pool.end();
  if (redis.isOpen) await redis.close();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

describe('worker /ready against real Postgres and Redis', () => {
  it('returns 200 when both answer', async () => {
    const app = createHealthApp({
      version: '0.0.0',
      commit: 'test',
      readiness: {
        db: async () => {
          await pool.query('select 1');
        },
        redis: async () => {
          await redis.ping();
        },
      },
    });
    const response = await app.request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });

  it('can LISTEN on the direct connection', async () => {
    const client = await pool.connect();
    try {
      const received = new Promise<string | undefined>((resolve) => {
        client.on('notification', (message) => resolve(message.payload));
      });
      await client.query('LISTEN worker_probe');
      await pool.query("select pg_notify('worker_probe', 'wake')");
      expect(await received).toBe('wake');
    } finally {
      client.release();
    }
  });
});
