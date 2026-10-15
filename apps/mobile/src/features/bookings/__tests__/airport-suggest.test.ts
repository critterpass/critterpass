import { airportDataset } from '@cp/content/airports';
import { describe, expect, it } from '@jest/globals';

import { airportCity, airportProblem, airportSuggestion } from '../detail/airport-suggest';

describe('airport "did you mean"', () => {
  const dataset = airportDataset();

  it('takes a known code as typed', () => {
    expect(airportSuggestion('sin', dataset)).toBeNull();
    expect(airportSuggestion(' DPS ', dataset)).toBeNull();
  });

  it('offers the airport for a city or airport name', () => {
    expect(airportSuggestion('Singapore', dataset)).toMatchObject({ iata: 'SIN' });
    expect(airportSuggestion('denpasar', dataset)).toMatchObject({ iata: 'DPS' });
  });

  it('suggests nothing for too little or nothing close', () => {
    expect(airportSuggestion('s', dataset)).toBeNull();
    expect(airportSuggestion('qqqqzz', dataset)).toBeNull();
  });

  it('names the city a known code serves', () => {
    expect(airportCity(' sin', dataset)).toBe('Singapore');
    expect(airportCity('Singapore', dataset)).toBeNull();
  });

  it('calls a code one letter too long, and anything else wrong only once Save was tried', () => {
    expect(airportProblem('DENP', dataset, false)).toBe('tooLong');
    expect(airportProblem('denpasar', dataset, false)).toBeNull();
    expect(airportProblem('', dataset, false)).toBeNull();
    expect(airportProblem('', dataset, true)).toBe('notCode');
    expect(airportProblem('DPS', dataset, true)).toBeNull();
  });
});
