import { createTransport } from '@sentry/core';
import { describe, expect, it } from 'vitest';

import { initWorkerSentry } from '../../src/obs/sentry';

/** Sentry's HTTP boundary: every envelope the SDK would send, parsed. */
const events: Record<string, unknown>[] = [];
const decoder = new TextDecoder();

const reporter = initWorkerSentry({
  dsn: 'https://public@o1.ingest.us.sentry.io/1',
  environment: 'test',
  release: 'worker@0.0.0+test',
  transport: (options) =>
    createTransport(options, (request) => {
      const text = typeof request.body === 'string' ? request.body : decoder.decode(request.body);
      const items = text.split('\n').filter(Boolean);
      events.push(...items.map((line) => JSON.parse(line) as Record<string, unknown>));
      return Promise.resolve({ statusCode: 200 });
    }),
});

describe('worker sentry', () => {
  it('reports a dead letter by queue with a scrubbed message and no payload', async () => {
    reporter.deadLetter({
      queue: 'push.send',
      jobId: 'job-1',
      attempts: 3,
      message: 'APNs rejected token for +84 90 123 4567',
    });
    await reporter.flush();
    const event = events.find((item) => 'exception' in item);
    expect(event?.['tags']).toMatchObject({ queue: 'push.send' });
    expect(event?.['fingerprint']).toEqual(['dead-letter', 'push.send']);
    // Stack frames carry source context lines (this test's own literals), not job data.
    const view = JSON.stringify(event, (key, value: unknown) =>
      key === 'stacktrace' ? undefined : value,
    );
    expect(view).not.toContain('123 4567');
    expect(view).toContain('[redacted]');
    expect(event?.['release']).toBe('worker@0.0.0+test');
  });
});
