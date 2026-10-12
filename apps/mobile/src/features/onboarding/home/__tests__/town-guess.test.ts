import { describe, expect, it } from '@jest/globals';

import { airportDataset } from '../../content';
import { hintAt, townGuess, townPointFrom } from '../town-guess';

const UBUD = { lat: -8.5069, lng: 115.2625 };

describe('a town no airport matched', () => {
  it('takes the first town-like answer of the geocoder, skipping places and bad rows', () => {
    expect(
      townPointFrom({
        results: [
          { source: 'poi', label: 'Ubud Palace', ...UBUD },
          { source: 'city', label: '  ', ...UBUD },
          { source: 'mapbox', label: 'Ubud, Bali, Indonesia', ...UBUD },
        ],
      }),
    ).toEqual({ label: 'Ubud, Bali, Indonesia', ...UBUD });
    expect(townPointFrom({ results: [] })).toBeNull();
    expect(townPointFrom(null)).toBeNull();
  });

  it('names the town, its region and the nearest airport people fly from', () => {
    const airports = airportDataset().airports;
    expect(townGuess(airports, { label: 'Ubud, Bali, Indonesia', ...UBUD })).toEqual({
      town: 'Ubud',
      region: 'Bali, Indonesia',
      iata: 'DPS',
    });
    expect(townGuess(airports, { label: 'Ubud', ...UBUD })).toMatchObject({ region: null });
  });

  it('turns a one-shot fix into a hint whose nearest airport leads', () => {
    const hint = hintAt(airportDataset().airports, UBUD);
    expect(hint.point).toEqual(UBUD);
    expect(hint.nearest_iata[0]).toBe('DPS');
  });
});
