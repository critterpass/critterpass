/** The past-trip form never stores a month still to come, and finds countries by name. */
import { describe, expect, it } from '@jest/globals';

import { draftOf, monthsOpen, pastTripYears, searchCountries } from '../past-trip-form';

const TODAY = '2026-10-03';

describe('past trip form', () => {
  it('needs a country, a year and a month, none of them in the future', () => {
    expect(draftOf('PT', 2019, 6, TODAY)).toEqual({ country: 'PT', month: '2019-06' });
    expect(draftOf('PT', 2026, 10, TODAY)).toEqual({ country: 'PT', month: '2026-10' });
    expect(draftOf('PT', 2026, 11, TODAY)).toBeNull();
    expect(draftOf(null, 2019, 6, TODAY)).toBeNull();
    expect(draftOf('PT', 2019, null, TODAY)).toBeNull();
  });

  it('opens only the months that have begun this year', () => {
    expect([...monthsOpen(2026, TODAY)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(monthsOpen(2025, TODAY).size).toBe(12);
    expect(pastTripYears(TODAY)[0]).toBe(2026);
  });

  it('matches names without accents, names that start with the query first', () => {
    const options = [
      { code: 'VN', name: 'Việt Nam' },
      { code: 'PT', name: 'Portugal' },
      { code: 'PR', name: 'Puerto Rico' },
      { code: 'SG', name: 'Singapore' },
    ];
    expect(searchCountries(options, 'viet').map((o) => o.code)).toEqual(['VN']);
    expect(searchCountries(options, 'por').map((o) => o.code)).toEqual(['PT', 'SG']);
    expect(searchCountries(options, 'sg').map((o) => o.code)).toEqual(['SG']);
    expect(searchCountries(options, '  ')).toEqual([]);
  });
});
