import { createTransport } from '@sentry/core';
import { pino } from 'pino';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { initSentry } from '../../src/obs/sentry';

/** Sentry's HTTP boundary: every envelope the SDK would send, parsed. */
const envelopes: Record<string, unknown>[][] = [];
const decoder = new TextDecoder();

const errors = initSentry({
  dsn: 'https://public@o1.ingest.us.sentry.io/1',
  environment: 'test',
  release: 'api@0.0.0+test',
  transport: (options) =>
    createTransport(options, (request) => {
      const text = typeof request.body === 'string' ? request.body : decoder.decode(request.body);
      envelopes.push(
        text
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>),
      );
      return Promise.resolve({ statusCode: 200 });
    }),
});

afterAll(async () => {
  await errors.flush();
});

function app() {
  const instance = createApp({
    service: 'api',
    version: '0.0.0',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    readiness: {},
    exposeDocs: false,
    errors,
  });
  instance.post('/v1/boom', () => {
    throw new Error('exploded for anna@example.com');
  });
  return instance;
}

describe('sentry', () => {
  it('returns the event id in INTERNAL and sends a scrubbed event', async () => {
    const response = await app().request('/v1/boom?token=secret-token', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'session=abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'private message', budget_max: 987_654 }),
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as {
      error: { code: string; detail?: { event_id?: string } };
    };
    expect(body.error.code).toBe('INTERNAL');
    const eventId = body.error.detail?.event_id;
    expect(eventId).toMatch(/^[0-9a-f]{32}$/u);

    await errors.flush();
    const event = envelopes
      .flat()
      .find((item) => item['event_id'] === eventId && 'exception' in item);
    expect(event).toBeDefined();
    // Stack frames carry source context lines (this test's own literals), not request data.
    const serialised = JSON.stringify(envelopes, (key, value: unknown) =>
      key === 'stacktrace' ? undefined : value,
    );
    for (const secret of [
      'secret-token',
      'session=abc',
      'private message',
      'anna@example.com',
      '987654',
    ]) {
      expect(serialised).not.toContain(secret);
    }
    expect(event?.['release']).toBe('api@0.0.0+test');
    expect(event?.['environment']).toBe('test');
  });
});
