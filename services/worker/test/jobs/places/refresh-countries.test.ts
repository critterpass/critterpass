import { describe, expect, it } from 'vitest';

import { refreshCountries } from '../../../src/jobs/places';

describe('the monthly places refresh scope', () => {
  it('covers every destination when no country is set', () => {
    expect(refreshCountries({})).toBeNull();
    expect(refreshCountries({ PLACES_REFRESH_COUNTRIES: ' , ' })).toBeNull();
  });

  it('reads ISO country codes, trimmed, upper-cased and once each', () => {
    expect(refreshCountries({ PLACES_REFRESH_COUNTRIES: 'VN' })).toEqual(['VN']);
    expect(refreshCountries({ PLACES_REFRESH_COUNTRIES: ' vn, TH ,VN' })).toEqual(['VN', 'TH']);
  });

  it('ignores anything that is not a two-letter code', () => {
    expect(refreshCountries({ PLACES_REFRESH_COUNTRIES: 'Vietnam,VN' })).toEqual(['VN']);
    expect(refreshCountries({ PLACES_REFRESH_COUNTRIES: 'Vietnam' })).toBeNull();
  });
});
