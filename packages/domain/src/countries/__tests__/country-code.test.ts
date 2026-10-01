import { describe, expect, it } from 'vitest';

import { isSameCountry, toCountryCode } from '../country-code';

describe('toCountryCode', () => {
  it('reads a code in any case', () => {
    expect(toCountryCode('VN')).toBe('VN');
    expect(toCountryCode(' vn ')).toBe('VN');
  });

  it('reads the names the catalogue stores, with or without diacritics', () => {
    expect(toCountryCode('Vietnam')).toBe('VN');
    expect(toCountryCode('Viet Nam')).toBe('VN');
    expect(toCountryCode('Indonesia')).toBe('ID');
    expect(toCountryCode('South Korea')).toBe('KR');
    expect(toCountryCode('United Kingdom')).toBe('GB');
    expect(toCountryCode('United States')).toBe('US');
    expect(toCountryCode('UK')).toBe('GB');
    expect(toCountryCode('US')).toBe('US');
    expect(toCountryCode('Türkiye')).toBe('TR');
    expect(toCountryCode('turkiye')).toBe('TR');
    expect(toCountryCode("Côte d'Ivoire")).toBe('CI');
  });

  it('is unknown, not a guess, for anything else', () => {
    expect(toCountryCode(null)).toBeNull();
    expect(toCountryCode(undefined)).toBeNull();
    expect(toCountryCode('')).toBeNull();
    expect(toCountryCode('Atlantis')).toBeNull();
    expect(toCountryCode('VNM')).toBeNull();
  });
});

describe('isSameCountry', () => {
  it('matches a name against a code and never matches an unknown', () => {
    expect(isSameCountry('Vietnam', 'VN')).toBe(true);
    expect(isSameCountry('vn', 'VN')).toBe(true);
    expect(isSameCountry('Vietnam', 'SG')).toBe(false);
    expect(isSameCountry(null, null)).toBe(false);
    expect(isSameCountry('Atlantis', 'Atlantis')).toBe(false);
  });
});
