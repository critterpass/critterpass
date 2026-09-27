import { describe, expect, it } from '@jest/globals';

import { pickDeviceLocale } from './device-locale';

const shipped = ['en', 'zh-Hans', 'id', 'ja', 'es', 'pt', 'fr', 'ko', 'th', 'vi'];

describe('pickDeviceLocale', () => {
  it('prefers an exact BCP-47 match over the device’s later, less-specific preferences', () => {
    const deviceLocales = [
      { languageTag: 'en-GB', languageCode: 'en' },
      { languageTag: 'vi-VN', languageCode: 'vi' },
    ];
    expect(pickDeviceLocale(shipped, deviceLocales)).toBe('en');
  });

  it('falls back to a same-language match when no shipped locale matches the full tag', () => {
    // The device prefers Traditional Chinese; only Simplified ships, but same-language still beats
    // falling straight to English.
    const deviceLocales = [{ languageTag: 'zh-Hant', languageCode: 'zh' }];
    expect(pickDeviceLocale(shipped, deviceLocales)).toBe('zh-Hans');
  });

  it('returns undefined when nothing in the device preference list is shipped', () => {
    const deviceLocales = [{ languageTag: 'de-DE', languageCode: 'de' }];
    expect(pickDeviceLocale(shipped, deviceLocales)).toBeUndefined();
  });

  it('walks the whole preference list before giving up', () => {
    const deviceLocales = [
      { languageTag: 'de-DE', languageCode: 'de' },
      { languageTag: 'th-TH', languageCode: 'th' },
    ];
    expect(pickDeviceLocale(shipped, deviceLocales)).toBe('th');
  });
});
