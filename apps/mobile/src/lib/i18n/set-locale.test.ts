import { i18n } from '@lingui/core';
import { describe, expect, it, jest } from '@jest/globals';

// react-native-mmkv's own createMMKV() is meant to detect a Jest worker and return its in-memory
// mock (react-native-mmkv/src/createMMKV/createMockMMKV.ts) instead of the real native store — but
// react-native-nitro-modules' own module-scope native lookup throws before createMMKV's body (and
// its test-mode check) ever runs, so the built-in escape hatch never activates. A minimal in-memory
// stand-in for the two calls this module makes is enough to exercise the real persistence logic
// around it, the same category of boundary code-standards.md §17 already treats this way for
// push/store SDKs, just a device API instead of a network one.
const mockStore = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  createMMKV: jest.fn(() => ({
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => {
      mockStore.set(key, value);
    },
  })),
}));

import { onLocaleChanged, persistedLocale, setLocale } from './set-locale';

describe('persistedLocale / setLocale', () => {
  it('is undefined before any locale has been persisted', () => {
    expect(persistedLocale()).toBeUndefined();
  });

  it('activates the resolved locale and persists it by default', async () => {
    await setLocale('en');
    expect(i18n.locale).toBe('en');
    expect(persistedLocale()).toBe('en');
  });

  it('falls back to the source locale for an unregistered code', async () => {
    await setLocale('xx-XX');
    expect(i18n.locale).toBe('en');
    expect(persistedLocale()).toBe('en');
  });

  it('does not overwrite the persisted choice when persist: false', async () => {
    await setLocale('vi'); // establish a known persisted value
    await setLocale('en', { persist: false });
    expect(i18n.locale).toBe('en'); // still activates in place
    expect(persistedLocale()).toBe('vi'); // but leaves the stored choice untouched
  });
});

describe('onLocaleChanged', () => {
  it('fires only when the active locale actually changes, not on every catalog load', async () => {
    await setLocale('en');
    const seen: string[] = [];
    const unsubscribe = onLocaleChanged((locale) => seen.push(locale));

    await setLocale('en'); // same locale again: no change event expected
    expect(seen).toEqual([]);

    await setLocale('vi');
    expect(seen).toEqual(['vi']);

    unsubscribe();
    await setLocale('en');
    expect(seen).toEqual(['vi']); // unsubscribed: no further callbacks
  });
});
