import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

function buildApp(exposeDocs: boolean) {
  return createApp({
    service: 'api',
    version: '1.2.3',
    commit: 'abc1234',
    logger: pino({ level: 'silent' }),
    readiness: {},
    exposeDocs,
  });
}

const JSON_POLICY = "default-src 'none'; frame-ancestors 'none'";

describe('security headers', () => {
  it.each(['/health', '/openapi.json', '/v1/no-such-route'])('are sent on %s', async (path) => {
    const response = await buildApp(false).request(path);
    const maxAge = /max-age=(\d+)/u.exec(response.headers.get('strict-transport-security') ?? '');
    expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(15_552_000);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toBe(JSON_POLICY);
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('are sent on an error raised by a handler', async () => {
    const app = buildApp(false);
    app.get('/boom', () => {
      throw new Error('boom');
    });
    const response = await app.request('/boom');
    expect(response.status).toBe(500);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe(JSON_POLICY);
  });

  it('leave the API reference page free to load its own script and styles', async () => {
    const response = await buildApp(true).request('/docs');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');
  });
});
