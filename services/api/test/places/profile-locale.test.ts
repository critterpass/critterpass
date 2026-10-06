import { describe, expect, it } from 'vitest';

import { profileLocaleOf } from '../../src/places/profile';

describe('the app language a reader gets a place profile in', () => {
  it('covers every app language, not only those the server writes in', () => {
    expect(profileLocaleOf('de-DE')).toBe('de');
    expect(profileLocaleOf('ms_MY')).toBe('ms');
    expect(profileLocaleOf('tr')).toBe('tr');
    expect(profileLocaleOf('nl-BE')).toBe('nl');
    expect(profileLocaleOf('ko-KR')).toBe('ko');
    expect(profileLocaleOf('zh-Hant-TW')).toBe('zh-Hans');
    expect(profileLocaleOf('in')).toBe('id');
  });

  it('never picks the pseudo-locale, and knows nothing of unshipped languages', () => {
    expect(profileLocaleOf('en-XA')).toBe('en');
    expect(profileLocaleOf('sw-KE')).toBeNull();
    expect(profileLocaleOf('')).toBeNull();
    expect(profileLocaleOf(null)).toBeNull();
  });
});
