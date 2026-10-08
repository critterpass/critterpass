/** First-run Home's "Close to home": the catalogue's places in the traveller's own country. */
import { describe, expect, it } from '@jest/globals';

import { nearHomePlaces, type DestinationRow } from '../first-run-grid';

const row = (
  id: string,
  country: string,
  coverage: string,
  home: string | null,
): DestinationRow => ({
  id,
  name: id,
  country,
  coverage,
  home,
});

describe('places close to home', () => {
  it('matches a country written by name to a home written by code, live guides first', () => {
    const rows = [
      row('Bali', 'Indonesia', 'live', 'VN'),
      row('Đà Lạt', 'Vietnam', 'ready', 'VN'),
      row('Đà Nẵng', 'Vietnam', 'live', 'VN'),
    ];
    expect(nearHomePlaces(rows).map((place) => place.id)).toEqual(['Đà Nẵng', 'Đà Lạt']);
  });

  it('offers nothing before the home country is known', () => {
    expect(nearHomePlaces([row('Đà Lạt', 'Vietnam', 'live', null)])).toEqual([]);
    expect(nearHomePlaces([])).toEqual([]);
  });
});
