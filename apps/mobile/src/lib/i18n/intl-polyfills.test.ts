import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setupI18n } from '@lingui/core';

// Test-only registry lookup, the same reach past the lib boundary I18nRoot.tsx documents.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { format, locales } from '@cp/i18n';

/** The Intl constructors Hermes lacks and the app polyfills, with Node's own implementations. */
const POLYFILLED = ['PluralRules', 'RelativeTimeFormat', 'ListFormat'] as const;
const native = Object.fromEntries(POLYFILLED.map((name) => [name, Intl[name]])) as unknown as Pick<
  typeof Intl,
  (typeof POLYFILLED)[number]
>;

// Node's answers for the same inputs, taken before the native constructors are removed.
const codes = locales.map((entry) => entry.code);
const nativeYesterday = codes.map((code) =>
  new native.RelativeTimeFormat(code, { numeric: 'auto' }).format(-1, 'day'),
);
const nativeList = codes.map((code) =>
  new native.ListFormat(code).format(['Maya', 'Jordan', 'Winston']),
);

let loadIntlLocaleData: (tag: string) => void;

// Node has all three and Hermes has none: remove them, then load the polyfills the way the app
// does on a device.
beforeEach(async () => {
  for (const name of POLYFILLED) Reflect.deleteProperty(Intl, name);
  // A fresh module registry per test (not an isolated scope that closes after the import): the
  // data files `loadIntlLocaleData` requires later must load against this test's polyfills.
  jest.resetModules();
  ({ loadIntlLocaleData } = await import('./intl-polyfills'));
});

afterEach(() => {
  for (const name of POLYFILLED) {
    Object.defineProperty(Intl, name, { value: native[name], configurable: true, writable: true });
  }
});

function language(tag: string): string {
  return new Intl.Locale(tag).language;
}

describe('intl-polyfills on an engine without the Intl APIs Hermes lacks', () => {
  it.each(POLYFILLED)('installs Intl.%s', (name) => {
    expect(typeof Intl[name]).toBe('function');
    expect(Intl[name]).not.toBe(native[name]);
  });

  it.each(POLYFILLED)('starts with English data only, the fallback for any other tag', (name) => {
    expect(new Intl[name]('en').resolvedOptions().locale).toBe('en');
    expect(language(new Intl[name]('pl').resolvedOptions().locale)).toBe('en');
    expect(language(new Intl[name]('ja').resolvedOptions().locale)).toBe('en');
  });

  it('loads one language’s data when that language is activated, and no other', () => {
    loadIntlLocaleData('pl');

    expect(new Intl.PluralRules('pl').select(5)).toBe('many');
    expect(new Intl.RelativeTimeFormat('pl').resolvedOptions().locale).toBe('pl');
    expect(new Intl.ListFormat('pl').resolvedOptions().locale).toBe('pl');
    expect(language(new Intl.PluralRules('ja').resolvedOptions().locale)).toBe('en');
  });

  it('switches to the next language’s data on a later switch', () => {
    loadIntlLocaleData('vi');
    loadIntlLocaleData('zh-Hans');

    expect(new Intl.PluralRules('vi').select(1)).toBe('other');
    expect(language(new Intl.ListFormat('zh-Hans').resolvedOptions().locale)).toBe('zh');
  });

  it.each(POLYFILLED)('has Intl.%s data for the language of every registry locale', (name) => {
    for (const code of codes) {
      loadIntlLocaleData(code);
      const resolved = new Intl[name](code).resolvedOptions().locale;
      expect({ code, language: language(resolved) }).toEqual({ code, language: language(code) });
    }
  });

  it('picks each language’s own plural categories', () => {
    expect(new Intl.PluralRules('en').select(1)).toBe('one');
    expect(new Intl.PluralRules('en').select(3)).toBe('other');
    loadIntlLocaleData('pl');
    loadIntlLocaleData('vi');
    expect(new Intl.PluralRules('pl').select(5)).toBe('many');
    expect(new Intl.PluralRules('vi').select(1)).toBe('other');
  });

  it('lets Lingui format plural messages', () => {
    const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
    const votes = (count: number) =>
      i18n._({
        id: 'test.votes',
        message: '{count, plural, one {# vote} other {# votes}}',
        values: { count },
      });

    expect(votes(1)).toBe('1 vote');
    expect(votes(3)).toBe('3 votes');
  });

  it('formats relative times as the platform would, in every registry locale', () => {
    codes.forEach((code, i) => {
      loadIntlLocaleData(code);
      expect({ code, text: format.relativeTime(code, -1, 'day', { numeric: 'auto' }) }).toEqual({
        code,
        text: nativeYesterday[i],
      });
    });
    expect(format.relativeTime('en', -5, 'minute')).toBe('5 minutes ago');
  });

  it('formats lists as the platform would, in every registry locale', () => {
    codes.forEach((code, i) => {
      loadIntlLocaleData(code);
      expect({ code, text: format.list(code, ['Maya', 'Jordan', 'Winston']) }).toEqual({
        code,
        text: nativeList[i],
      });
    });
  });
});
