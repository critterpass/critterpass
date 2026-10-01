import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SITE_LOCALE_CODES,
  locateLocale,
  matchLanguageTag,
  negotiateLocale,
  parseAcceptLanguage,
} from './locale';

describe('site languages', () => {
  it('are the ten shipped languages, without the pseudo-locale', () => {
    expect(SITE_LOCALE_CODES).toEqual([
      'en',
      'zh-Hans',
      'id',
      'ja',
      'es',
      'pt',
      'fr',
      'ko',
      'th',
      'vi',
    ]);
  });

  it('never share an address with another route', () => {
    // `/id` is Indonesian while `/i/<code>` is an invite link: a locale named like a top-level
    // route (or the other way round) would hide one behind the other.
    const routes = readdirSync(new URL('../pages', import.meta.url)).map((entry) =>
      entry.replace(/\.(astro|ts)$/u, '').toLowerCase(),
    );
    expect(routes).toEqual(expect.arrayContaining(['i', 'r', 'j', 'p', 'g', 'w', 'api', 'og']));
    for (const code of SITE_LOCALE_CODES) {
      expect(routes, `/${code}`).not.toContain(code.toLowerCase());
    }
  });
});

describe('matchLanguageTag', () => {
  it.each([
    ['vi', 'vi'],
    ['vi-VN', 'vi'],
    ['VI-vn', 'vi'],
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['es-419', 'es'],
    ['es-MX', 'es'],
    ['fr-CA', 'fr'],
    ['en-GB', 'en'],
    ['ja-JP', 'ja'],
    ['ko-KR', 'ko'],
    ['th-TH', 'th'],
    ['id-ID', 'id'],
    ['in', 'id'],
    ['in-ID', 'id'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-Hans-HK', 'zh-Hans'],
    ['zh_CN', 'zh-Hans'],
  ])('%s is served by %s', (tag, locale) => {
    expect(matchLanguageTag(tag)).toBe(locale);
  });

  it.each(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-CN'])(
    '%s is Traditional Chinese, which is not shipped',
    (tag) => {
      expect(matchLanguageTag(tag)).toBeNull();
    },
  );

  it.each(['de', 'de-DE', 'it', 'ms', 'i', '', '*'])('%s has no shipped language', (tag) => {
    expect(matchLanguageTag(tag)).toBeNull();
  });

  it('serves the pseudo-locale tag as plain English', () => {
    expect(matchLanguageTag('en-XA')).toBe('en');
  });
});

describe('parseAcceptLanguage', () => {
  it('orders by q-value and keeps the sent order between equals', () => {
    expect(parseAcceptLanguage('en;q=0.5, ja, vi;q=0.9, fr')).toEqual(['ja', 'fr', 'vi', 'en']);
  });

  it('drops wildcards, refusals and malformed weights', () => {
    expect(parseAcceptLanguage('*, vi;q=0, ja;q=abc, ko;q=0.3')).toEqual(['ko']);
    expect(parseAcceptLanguage('')).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('negotiateLocale', () => {
  it('uses the browser language when nothing else is known', () => {
    expect(negotiateLocale({ acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' })).toEqual({
      locale: 'vi',
      source: 'header',
    });
    expect(negotiateLocale({ acceptLanguage: 'ja,en;q=0.8' }).locale).toBe('ja');
  });

  it('honours q-values over the order sent', () => {
    expect(negotiateLocale({ acceptLanguage: 'en;q=0.4, ko;q=0.9' }).locale).toBe('ko');
  });

  it('skips languages that are not shipped and takes the next preference', () => {
    expect(negotiateLocale({ acceptLanguage: 'de-DE,de;q=0.9,fr;q=0.8,en;q=0.7' }).locale).toBe(
      'fr',
    );
    expect(negotiateLocale({ acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8' }).locale).toBe('zh-Hans');
    expect(negotiateLocale({ acceptLanguage: 'zh-HK,ja;q=0.9' }).locale).toBe('ja');
  });

  it('falls back to English', () => {
    expect(negotiateLocale({ acceptLanguage: 'de' })).toEqual({ locale: 'en', source: 'default' });
    expect(negotiateLocale({})).toEqual({ locale: 'en', source: 'default' });
  });

  it('lets the remembered choice beat the browser language', () => {
    expect(negotiateLocale({ cookieLocale: 'th', acceptLanguage: 'vi' })).toEqual({
      locale: 'th',
      source: 'cookie',
    });
  });

  it('ignores a cookie that names no shipped language', () => {
    expect(negotiateLocale({ cookieLocale: 'de', acceptLanguage: 'vi' }).locale).toBe('vi');
    expect(negotiateLocale({ cookieLocale: 'en-XA', acceptLanguage: 'vi' }).locale).toBe('vi');
    expect(negotiateLocale({ cookieLocale: '', acceptLanguage: 'vi' }).locale).toBe('vi');
  });

  it('lets the address beat the cookie and the browser language', () => {
    expect(
      negotiateLocale({ pathLocale: 'zh-Hans', cookieLocale: 'th', acceptLanguage: 'vi' }),
    ).toEqual({ locale: 'zh-Hans', source: 'path' });
  });
});

describe('locateLocale', () => {
  it('finds a language whatever the letter case of the address', () => {
    expect(locateLocale('zh-hans')).toBe('zh-Hans');
    expect(locateLocale('VI')).toBe('vi');
    expect(locateLocale('i')).toBeNull();
    expect(locateLocale('privacy')).toBeNull();
  });
});
