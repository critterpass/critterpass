/**
 * Long-lived connections whose socket fails (a TLS `read ETIMEDOUT` from the managed database, a
 * Redis reset) must be logged and replaced, never crash the api. The sockets are failed the way
 * the network fails them: destroyed with an error underneath the client.
 */
import type { Socket } from 'node:net';

import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import type pg from 'pg';
import { pino } from 'pino';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRequestPool } from '../../src/db-pool';
import { createRedisClient } from '../../src/redis-client';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
});

afterAll(async () => {
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

interface Logged {
  readonly level: number;
  readonly msg: string;
  readonly err?: { readonly code?: string };
}

/** A real pino logger whose JSON lines are kept for assertions. */
function recordingLogger() {
  const logged: Logged[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (line: string) => logged.push(JSON.parse(line) as Logged) },
  );
  return { logged, logger };
}

function timedOut(): Error {
  return Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT', syscall: 'read' });
}

function failSocket(client: pg.PoolClient): void {
  (client as unknown as { connection: { stream: Socket } }).connection.stream.destroy(timedOut());
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !check(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(check()).toBe(true);
}

describe('database pool connection errors', () => {
  it('logs an idle client that times out once and keeps serving', async () => {
    const { logged, logger } = recordingLogger();
    const pool = createRequestPool(postgres.getConnectionUri(), 2, logger);
    try {
      const client = await pool.connect();
      client.release();
      failSocket(client);
      await until(() => logged.length > 0);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ level: 50, err: { code: 'ETIMEDOUT' } });
      const { rows } = await pool.query<{ ok: number }>('select 1 as ok');
      expect(rows).toEqual([{ ok: 1 }]);
    } finally {
      await pool.end();
    }
  });

  it('logs a checked-out client that times out mid-query and replaces it', async () => {
    const { logged, logger } = recordingLogger();
    const pool = createRequestPool(postgres.getConnectionUri(), 1, logger);
    try {
      const client = await pool.connect();
      // pg-pool drops its own listener while a client is checked out; this one must remain.
      expect(client.listenerCount('error')).toBeGreaterThan(0);
      const running = client.query('select pg_sleep(5)');
      failSocket(client);
      await expect(running).rejects.toThrow('read ETIMEDOUT');
      client.release();
      await until(() => logged.length > 0);
      expect(logged[0]?.msg).toBe('database client error');
      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain(postgres.getPassword());
      // max 1: this only answers if the pool discarded the broken client and opened a new one.
      const { rows } = await pool.query<{ ok: number }>('select 1 as ok');
      expect(rows).toEqual([{ ok: 1 }]);
    } finally {
      await pool.end();
    }
  });
});

describe('redis connection errors', () => {
  it('logs a dropped connection, reconnects and keeps serving', async () => {
    const { logged, logger } = recordingLogger();
    const redis = createRedisClient(redisContainer.getConnectionUrl(), logger);
    const admin = createClient({ url: redisContainer.getConnectionUrl() });
    try {
      await Promise.all([redis.connect(), admin.connect()]);
      const id = await redis.clientId();
      await admin.sendCommand(['CLIENT', 'KILL', 'ID', String(id)]);
      await until(() => logged.some((entry) => entry.level === 40));
      expect(logged[0]?.msg).toBe('redis connection error');
      expect(await redis.ping()).toBe('PONG');
      expect(await redis.clientId()).not.toBe(id);
    } finally {
      redis.destroy();
      admin.destroy();
    }
  });
});
