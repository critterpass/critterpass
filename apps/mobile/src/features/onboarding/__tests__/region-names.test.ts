import { describe, expect, it } from '@jest/globals';

import { DIAL_CODES } from '@cp/content/onboarding';

import { countryList } from '../phone/phone-number';
import { regionName } from '../region-names';

describe('region names the app ships', () => {
  it('names a country in the reader’s language', () => {
    expect(regionName('VN', 'vi')).toBe('Việt Nam');
    expect(regionName('AG', 'vi')).toBe('Antigua và Barbuda');
    expect(regionName('AG', 'en')).toBe('Antigua & Barbuda');
    expect(regionName('JP', 'zh-Hans')).toBe('日本');
  });

  it('takes a regional locale by its language, and English when the language has no table', () => {
    expect(regionName('VN', 'vi-VN')).toBe('Việt Nam');
    expect(regionName('DE', 'pt-BR')).toBe('Alemanha');
    expect(regionName('VN', 'sv')).toBe('Vietnam');
  });

  it('has a Vietnamese and an English name for every code the phone step can dial', () => {
    for (const code of Object.keys(DIAL_CODES)) {
      expect(regionName(code, 'vi')).toBeDefined();
      expect(regionName(code, 'en')).toBeDefined();
    }
  });

  it('lists the picker by those names, never by a bare code', () => {
    const list = countryList('vi', (code) => regionName(code, 'vi'));
    expect(list.find((row) => row.code === 'VN')?.name).toBe('Việt Nam');
    expect(list.filter((row) => row.name === row.code)).toEqual([]);
  });
});
