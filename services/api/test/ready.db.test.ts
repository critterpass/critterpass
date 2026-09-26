import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import pg from 'pg';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let redisStopped = false;

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
  // destroy, not close: a graceful QUIT would wait on a server one test deliberately stopped.
  if (redis.isOpen) redis.destroy();
  await Promise.all([postgres.stop(), redisStopped ? undefined : redisContainer.stop()]);
});

function buildApp() {
  return createApp({
    service: 'api',
    version: '0.0.0',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    exposeDocs: false,
    readiness: {
      db: async () => {
        await pool.query('select 1');
      },
      redis: async () => {
        if (!redis.isReady) throw new Error('redis not connected');
        await redis.ping();
      },
    },
  });
}

describe('GET /ready against real Postgres and Redis', () => {
  it('returns 200 when both answer', async () => {
    const response = await buildApp().request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });

  it('runs on the compose image: logical replication, extensions and the powersync publication', async () => {
    const { rows: wal } = await pool.query<{ wal_level: string }>('show wal_level');
    expect(wal[0]?.wal_level).toBe('logical');

    const { rows: extensions } = await pool.query<{ extname: string }>(
      'select extname from pg_extension',
    );
    expect(extensions.map((row) => row.extname)).toEqual(
      expect.arrayContaining(['vector', 'pg_trgm', 'unaccent', 'pgcrypto']),
    );

    const { rowCount } = await pool.query(
      "select 1 from pg_publication where pubname = 'powersync'",
    );
    expect(rowCount).toBe(1);
  });

  it('returns 503 naming Redis once it goes away', async () => {
    await redisContainer.stop();
    redisStopped = true;
    const response = await buildApp().request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'unavailable',
      checks: { db: 'ok', redis: 'fail' },
    });
  });
});
