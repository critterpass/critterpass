import { createTransport } from '@sentry/core';
import * as Sentry from '@sentry/browser';
import { describe, expect, it } from 'vitest';

import { initAdminSentry } from './sentry';

describe('admin sentry', () => {
  it('stays off without a DSN', () => {
    expect(initAdminSentry({ dsn: undefined, environment: 'test' })).toBe(false);
  });

  it('sends scrubbed errors only', async () => {
    const bodies: string[] = [];
    const decoder = new TextDecoder();
    initAdminSentry({
      dsn: 'https://public@o1.ingest.us.sentry.io/1',
      environment: 'test',
      transport: (options) =>
        createTransport(options, (request) => {
          bodies.push(
            typeof request.body === 'string' ? request.body : decoder.decode(request.body),
          );
          return Promise.resolve({ statusCode: 200 });
        }),
    });
    Sentry.setUser({ id: 'op-1', email: 'operator@critterpass.app' });
    Sentry.captureException(new Error('lookup failed for traveller@example.com'), {
      extra: { phone: '+84 90 123 4567', note: 'private' },
    });
    await Sentry.flush(2_000);
    const sent = bodies.join('\n');
    expect(sent).toContain('lookup failed for [redacted]');
    for (const secret of [
      'traveller@example.com',
      'operator@critterpass.app',
      '123 4567',
      'private',
    ]) {
      expect(sent).not.toContain(secret);
    }
  });
});
