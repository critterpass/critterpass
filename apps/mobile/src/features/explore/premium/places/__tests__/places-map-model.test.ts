import { describe, expect, it } from '@jest/globals';

import type { HubPlace } from '../../../places/places-model';
import { nearestToPicked } from '../place-cards';
import { placesChips } from '../places-chips';

function place(id: string, over: Partial<HubPlace> = {}): HubPlace {
  return {
    id,
    poiId: id,
    ideaId: null,
    name: id,
    category: 'food',
    lat: 0,
    lng: 0,
    standing: 'suggested',
    backerIds: [],
    dayNo: null,
    mustSee: false,
    hours: null,
    bestTime: null,
    ...over,
  };
}

describe('premium places map', () => {
  it('puts the picked place first, then the rest by distance from it', () => {
    const places = [
      place('far', { lat: 0, lng: 3 }),
      place('picked', { lat: 0, lng: 0 }),
      place('near', { lat: 0, lng: 1 }),
    ];
    expect(nearestToPicked(places, 'picked').map((p) => p.id)).toEqual(['picked', 'near', 'far']);
    expect(nearestToPicked(places, 'gone')).toEqual([]);
  });

  it('offers only the chips that have places, and keeps the chosen one even when empty', () => {
    const places = [place('a', { standing: 'saved' }), place('b', { category: 'beach' })];
    expect(placesChips(places, 'all').map((chip) => chip.filter)).toEqual([
      'all',
      'saved',
      'beaches',
      'food',
    ]);
    expect(placesChips(places, 'plan').map((chip) => [chip.filter, chip.count])).toContainEqual([
      'plan',
      0,
    ]);
  });
});
