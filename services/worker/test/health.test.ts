import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { loadWorkerEnv } from '../src/env';
import { createHealthApp } from '../src/health';

const unreachablePool = new pg.Pool({
  connectionString: 'postgres://app:app@127.0.0.1:1/critterpass',
  connectionTimeoutMillis: 500,
});

afterAll(async () => {
  await unreachablePool.end();
});

describe('worker health endpoint', () => {
  it('reports liveness without touching dependencies', async () => {
    const app = createHealthApp({
      version: '1.0.0',
      commit: 'abc',
      readiness: { db: () => Promise.reject(new Error('must not be called')) },
    });
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'worker',
      version: '1.0.0',
      commit: 'abc',
    });
  });

  it('returns 503 naming the database when it is unreachable', async () => {
    const app = createHealthApp({
      version: '1.0.0',
      commit: 'abc',
      readiness: {
        db: async () => {
          await unreachablePool.query('select 1');
        },
      },
    });
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', checks: { db: 'fail' } });
  });
});

describe('worker environment', () => {
  it('requires the direct database url and redis', () => {
    expect(() => loadWorkerEnv({})).toThrow(/DATABASE_DIRECT_URL[\s\S]*REDIS_URL/);
  });

  it('applies defaults for optional settings', () => {
    const env = loadWorkerEnv({
      DATABASE_DIRECT_URL: 'postgres://u:p@localhost:5432/critterpass',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(env).toMatchObject({
      PORT: 8788,
      LOG_LEVEL: 'info',
      COMMIT_SHA: 'dev',
      NODE_ENV: 'development',
    });
  });
});

describe('worker environment on platforms without a git commit', () => {
  it('falls back to "dev" when COMMIT_SHA resolves to an empty string', () => {
    const env = loadWorkerEnv({
      DATABASE_DIRECT_URL: 'postgres://u:p@localhost:5432/critterpass',
      REDIS_URL: 'redis://localhost:6379',
      COMMIT_SHA: '',
    });
    expect(env.COMMIT_SHA).toBe('dev');
  });
});
