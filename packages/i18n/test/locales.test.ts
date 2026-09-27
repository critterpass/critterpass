import { describe, expect, it } from 'vitest';

import {
  getLocale,
  isShippedLocale,
  localeCodes,
  locales,
  shippedLocaleCodes,
  sourceLocale,
} from '../src/locales.js';

// product-decisions.md §7 language default: the launch gate ships these ten regardless of the wider
// 16-language design render, pending the founder's exception confirmation (phase's own open question).
const launchLanguages = ['en', 'zh-Hans', 'id', 'ja', 'es', 'pt', 'fr', 'ko', 'th', 'vi'];

describe('locale registry', () => {
  it('ships exactly the founder-selected launch set', () => {
    expect(new Set(shippedLocaleCodes)).toEqual(new Set(launchLanguages));
  });

  it('registers the source locale and marks it shipped', () => {
    expect(sourceLocale).toBe('en');
    expect(isShippedLocale(sourceLocale)).toBe(true);
  });

  it('registers the dev pseudo-locale as unshipped and flagged', () => {
    const pseudo = getLocale('en-XA');
    expect(pseudo).toBeDefined();
    expect(pseudo?.pseudo).toBe(true);
    expect(pseudo?.shipped).toBe(false);
    expect(isShippedLocale('en-XA')).toBe(false);
  });

  it('has no duplicate locale codes', () => {
    expect(new Set(localeCodes).size).toBe(localeCodes.length);
  });

  it('gives every locale a non-empty English and native name and an ltr direction', () => {
    for (const entry of locales) {
      expect(entry.englishName.length).toBeGreaterThan(0);
      expect(entry.nativeName.length).toBeGreaterThan(0);
      // No shipped or registered locale is RTL yet (design-system.md §6: LTR UI, no RTL shipped);
      // this assertion should be revisited the day an RTL locale is registered.
      expect(entry.direction).toBe('ltr');
    }
  });

  it('looks up a registered locale and returns undefined for an unknown tag', () => {
    expect(getLocale('vi')?.nativeName).toBe('Tiếng Việt');
    expect(getLocale('xx-XX')).toBeUndefined();
  });
});
