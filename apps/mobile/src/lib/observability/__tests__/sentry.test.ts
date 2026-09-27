import { describe, expect, it } from '@jest/globals';

import { appRelease, sentryOptions } from '../sentry';

type SentryEvent = Parameters<NonNullable<ReturnType<typeof sentryOptions>['beforeSend']>>[0];

describe('app sentry options', () => {
  const options = sentryOptions({
    dsn: 'https://public@o1.ingest.us.sentry.io/1',
    environment: 'staging',
  });

  it('captures nothing visual and no default PII', () => {
    expect(options).toMatchObject({
      enabled: true,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableAutoSessionTracking: true,
    });
    expect(sentryOptions({ dsn: undefined, environment: 'development' }).enabled).toBe(false);
  });

  it('scrubs events before they leave the device', () => {
    const event = options.beforeSend?.(
      {
        message: 'sync failed for anna@example.com',
        request: { url: 'https://api.critterpass.app/v1/cmd?sig=abc', data: { text: 'hi' } },
        user: { id: 'pid', email: 'anna@example.com' },
        contexts: { device: { name: "Anna's iPhone", model: 'iPhone17,1' } },
        extra: { budget_max: 900 },
      } as unknown as SentryEvent,
      {},
    );
    expect(event).toEqual({
      message: 'sync failed for [redacted]',
      request: { url: 'https://api.critterpass.app/v1/cmd' },
      user: { id: 'pid' },
      contexts: { device: { model: 'iPhone17,1' } },
      extra: { budget_max: '[redacted]' },
    });
  });

  it('drops typed-input breadcrumbs and strips navigation query strings', () => {
    expect(options.beforeBreadcrumb?.({ category: 'ui.input', message: 'typed' }, {})).toBeNull();
    expect(
      options.beforeBreadcrumb?.({ category: 'navigation', data: { to: '/trip/1?code=ABC' } }, {}),
    ).toEqual({ category: 'navigation', data: { to: '/trip/1' } });
  });

  it('names the release by version and the running update', () => {
    expect(appRelease('1.2.0', '42', 'update-uuid')).toEqual({
      release: 'critterpass@1.2.0',
      dist: 'update-uuid',
    });
    expect(appRelease('1.2.0', '42', null)).toEqual({ release: 'critterpass@1.2.0', dist: '42' });
  });
});
