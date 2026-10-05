import { Validator } from '@seriousme/openapi-schema-validator';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

// Port 1 on loopback refuses connections: a real, unreachable database.
const unreachablePool = new pg.Pool({
  connectionString: 'postgres://app:app@127.0.0.1:1/critterpass',
  connectionTimeoutMillis: 500,
});

afterAll(async () => {
  await unreachablePool.end();
});

function buildApp(readiness: Parameters<typeof createApp>[0]['readiness'] = {}) {
  return createApp({
    service: 'api',
    version: '1.2.3',
    commit: 'abc1234',
    logger: pino({ level: 'silent' }),
    readiness,
    exposeDocs: false,
  });
}

describe('GET /health', () => {
  it('reports liveness with service, version and commit without touching dependencies', async () => {
    const app = buildApp({
      db: () => Promise.reject(new Error('must not be called')),
    });
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'api',
      version: '1.2.3',
      commit: 'abc1234',
    });
  });
});

describe('GET /health while the process is starting', () => {
  it('answers 503 until the job producer has started, then 200', async () => {
    let started = false;
    const app = createApp({
      service: 'api',
      version: '1.2.3',
      commit: 'abc1234',
      logger: pino({ level: 'silent' }),
      readiness: {},
      exposeDocs: false,
      started: () => started,
    });
    const before = await app.request('/health');
    expect(before.status).toBe(503);
    expect(await before.json()).toMatchObject({ status: 'starting', service: 'api' });
    started = true;
    const after = await app.request('/health');
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 503 naming the database when it is unreachable', async () => {
    const app = buildApp({
      db: async () => {
        await unreachablePool.query('select 1');
      },
    });
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', checks: { db: 'fail' } });
  });

  it('fails a probe that hangs instead of hanging the endpoint', async () => {
    const app = createApp({
      service: 'api',
      version: '1.2.3',
      commit: 'abc1234',
      logger: pino({ level: 'silent' }),
      exposeDocs: false,
      readiness: { redis: () => new Promise<void>(() => undefined) },
    });
    // The default probe timeout is 2 s; the request must settle well within the test timeout.
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', checks: { redis: 'fail' } });
  });
});

describe('request id', () => {
  it('echoes an incoming X-Request-Id', async () => {
    const response = await buildApp().request('/health', {
      headers: { 'X-Request-Id': 'req-123' },
    });
    expect(response.headers.get('X-Request-Id')).toBe('req-123');
  });

  it('generates one when the client sends none', async () => {
    const response = await buildApp().request('/health');
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('answers unknown routes with NOT_FOUND', async () => {
    const response = await buildApp().request('/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found', retryable: false },
    });
  });

  it('rejects bodies over 1 MiB with PAYLOAD_TOO_LARGE', async () => {
    const response = await buildApp().request('/health', {
      method: 'POST',
      body: 'x'.repeat(1024 * 1024 + 1),
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});

describe('GET /openapi.json', () => {
  it('serves a valid OpenAPI 3.1 document describing the ops routes', async () => {
    const response = await buildApp().request('/openapi.json');
    expect(response.status).toBe(200);
    const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/health', '/ready']));

    const result = await new Validator().validate(document);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
