import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  maskUserText,
  redact,
  redactPaths,
  redactString,
  scrubBreadcrumb,
  scrubErrorEvent,
  stripQuery,
} from './index';

describe('redact', () => {
  it('masks sensitive keys at any depth and keeps ids and enums', () => {
    const input = {
      trip_id: 'trip-1',
      status: 'open',
      user: {
        display_name: 'Anna',
        profile: { email: 'anna@example.com', phone: '+84 90 123 4567' },
      },
      items: [{ note: 'peanut allergy', kind: 'meal' }],
      headers: { Authorization: 'Bearer abc.def', 'X-Request-Id': 'r1' },
    };
    expect(redact(input)).toEqual({
      trip_id: 'trip-1',
      status: 'open',
      user: { display_name: REDACTED, profile: { email: REDACTED, phone: REDACTED } },
      items: [{ note: REDACTED, kind: 'meal' }],
      headers: { Authorization: REDACTED, 'X-Request-Id': 'r1' },
    });
  });

  it('scrubs personal-looking values under innocent keys', () => {
    expect(redact({ detail: 'mail anna@example.com or call +84 90 123 4567' })).toEqual({
      detail: `mail ${REDACTED} or call ${REDACTED}`,
    });
    expect(redactString('card 4111 1111 1111 1111 ok')).toBe(`card ${REDACTED} ok`);
    expect(redactString('eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4f')).toBe(REDACTED);
  });

  it('leaves ids and dates intact', () => {
    const id = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
    expect(redactString(`${id} at 2026-09-28T04:15:00Z`)).toBe(`${id} at 2026-09-28T04:15:00Z`);
  });

  it('masks extra registry keys and survives cycles', () => {
    const node: Record<string, unknown> = { budget_note: 'x', ok: 1 };
    node['self'] = node;
    expect(redact(node, { extraKeys: ['budget_note'] })).toEqual({
      budget_note: REDACTED,
      ok: 1,
      self: REDACTED,
    });
  });

  it('builds pino paths and masks user text', () => {
    expect(redactPaths(['email'])).toEqual(['email', '*.email', '*.*.email']);
    expect(maskUserText('where do we eat')).toBe('[user text: 15 chars]');
    expect(stripQuery('/v1/links/abc?token=1#x')).toBe('/v1/links/abc');
  });
});

describe('scrubErrorEvent', () => {
  it('drops bodies, headers, cookies and query strings and keeps only the user id', () => {
    const event = scrubErrorEvent({
      message: 'failed for anna@example.com',
      request: {
        url: 'https://api.critterpass.app/v1/cmd?sig=secret',
        method: 'POST',
        data: { text: 'hi' },
        headers: { authorization: 'Bearer x' },
        cookies: { session: 's' },
        query_string: 'sig=secret',
      },
      user: { id: 'pid', email: 'anna@example.com', ip_address: '1.2.3.4' },
      exception: { values: [{ type: 'Error', value: 'phone +84 90 123 4567 invalid' }] },
      contexts: { os: { name: 'iOS' }, device: { name: "Anna's iPhone", model: 'iPhone17,1' } },
      extra: { payload: { message: 'secret plan' } },
      breadcrumbs: [
        { category: 'ui.input', message: 'typed' },
        { category: 'fetch', data: { url: 'https://x.test/a?token=1', body: '{"a":1}' } },
      ],
    });
    expect(event).toEqual({
      message: `failed for ${REDACTED}`,
      request: { url: 'https://api.critterpass.app/v1/cmd', method: 'POST' },
      user: { id: 'pid' },
      exception: { values: [{ type: 'Error', value: `phone ${REDACTED} invalid` }] },
      contexts: { os: { name: 'iOS' }, device: { model: 'iPhone17,1' } },
      extra: { payload: { message: REDACTED } },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://x.test/a' } }],
    });
  });

  it('drops input breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'ui.input' })).toBeNull();
  });
});
