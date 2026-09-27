import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setupI18n } from '@lingui/core';

// Test-only registry lookup, the same reach past the lib boundary I18nRoot.tsx documents.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { locales } from '@cp/i18n';

const nativePluralRules = Intl.PluralRules;

function restoreNative(): void {
  Object.defineProperty(Intl, 'PluralRules', {
    value: nativePluralRules,
    configurable: true,
    writable: true,
  });
}

// Node has Intl.PluralRules and Hermes does not: remove it, then load the polyfills the way the
// app does on a device.
beforeEach(async () => {
  Reflect.deleteProperty(Intl, 'PluralRules');
  await jest.isolateModulesAsync(async () => {
    await import('./intl-polyfills');
  });
});

afterEach(restoreNative);

function language(tag: string): string {
  return new Intl.Locale(tag).language;
}

describe('intl-polyfills on an engine without Intl.PluralRules', () => {
  it('installs Intl.PluralRules', () => {
    expect(typeof Intl.PluralRules).toBe('function');
    expect(Intl.PluralRules).not.toBe(nativePluralRules);
  });

  it('has plural rules for the language of every locale in the registry', () => {
    for (const { code } of locales) {
      const resolved = new Intl.PluralRules(code).resolvedOptions().locale;
      expect({ code, language: language(resolved) }).toEqual({ code, language: language(code) });
    }
  });

  it('picks each language’s own categories', () => {
    expect(new Intl.PluralRules('en').select(1)).toBe('one');
    expect(new Intl.PluralRules('en').select(3)).toBe('other');
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
});
