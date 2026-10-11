import { airportDataset } from '@cp/content/airports';
import { describe, expect, it } from '@jest/globals';

import { airportSuggestion } from '../detail/airport-suggest';

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
});
