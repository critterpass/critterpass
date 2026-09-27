import { describe, expect, it } from 'vitest';

import { redactWebPath, redactWebUrl, scrubWebEvent } from './sentry';

describe('web error scrubbing', () => {
  it('cuts link codes and seats from paths', () => {
    expect(redactWebPath('/i/AB12CD/seat-token')).toBe('/i/:code');
    expect(redactWebPath('/r/FRIEND1')).toBe('/r/:code');
    expect(redactWebPath('/privacy')).toBe('/privacy');
    expect(redactWebUrl('https://critterpass.app/j/AB12CD?c=wa#x')).toBe(
      'https://critterpass.app/j/:code',
    );
  });

  it('scrubs the page URL, the message and the user', () => {
    const event = scrubWebEvent({
      message: 'failed for anna@example.com',
      request: { url: 'https://critterpass.app/i/AB12CD/seat?c=wa', headers: { cookie: 'x' } },
      user: { id: 'u1', ip_address: '1.2.3.4' } as { id: string },
    });
    expect(event).toEqual({
      message: 'failed for [redacted]',
      request: { url: 'https://critterpass.app/i/:code' },
      user: { id: 'u1' },
    });
  });
});
