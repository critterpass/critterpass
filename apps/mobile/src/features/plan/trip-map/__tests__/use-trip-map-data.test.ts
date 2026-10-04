/**
 * The places the trip map draws: saved places sized by how many back them and badged in the first
 * saver's colour, the guide's curated places as dots, nothing twice and nothing already in a day,
 * and a filter chip leaving lit exactly the places it names.
 */
import { tokens } from '@cp/design-tokens';
import { describe, expect, it } from '@jest/globals';

import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';

import { categoryChips, litPlaces, mapPlaces, NO_FILTER, type MapFilter } from '../map-places';

const MAYA = 'u-maya';
const ALEX = 'u-alex';
const RIN = 'u-rin';
const DEV = 'u-dev';

function idea(
  id: string,
  category: string,
  backers: readonly string[],
  poiId: string | null = id,
): TripIdeaView {
  return {
    id: `idea-${id}`,
    poiId,
    name: id,
    nameLocal: null,
    category,
    lat: -8.5,
    lng: 115.26,
    backerIds: backers,
    sources: [],
    sourceUrl: null,
    fit: null,
  };
}

const IDEAS = [
  idea('seniman', 'food', [DEV]),
  idea('tirta', 'temple_shrine', [MAYA, ALEX]),
  idea('tegallalang', 'nature', [MAYA, ALEX, RIN, DEV]),
  idea('campuhan', 'nature', [RIN]),
];
const CURATED = [
  { id: 'goa-gajah', name: 'Goa Gajah', category: 'temple_shrine', lat: -8.52, lng: 115.28 },
  { id: 'tirta', name: 'Tirta Empul', category: 'temple_shrine', lat: -8.41, lng: 115.31 },
  { id: 'nowhere', name: 'Unplaced', category: 'food', lat: null, lng: null },
];
const JOIN = new Map([
  [MAYA, 1],
  [ALEX, 4],
  [RIN, 2],
  [DEV, 5],
]);

function places(filter: MapFilter = NO_FILTER, showSuggested = true) {
  return mapPlaces({
    ideas: IDEAS,
    curated: CURATED,
    planned: new Set(['campuhan']),
    joinIndex: JOIN,
    filter,
    showSuggested,
  });
}

describe('trip map places', () => {
  it('sizes saved places by their backers and badges them in the first saver’s colour', () => {
    const byId = new Map(places().map((place) => [place.id, place]));
    expect(byId.get('seniman')).toMatchObject({ tier: 'saved', relevance: 1 });
    expect(byId.get('tirta')).toMatchObject({ tier: 'saved', relevance: 2 });
    expect(byId.get('tegallalang')).toMatchObject({ tier: 'saved', relevance: 3 });
    expect(byId.get('tirta')?.badgeColor).toBe(tokens.member.colors[1]);
    expect(byId.get('seniman')?.iconKey).toBe('pin-food');
  });

  it('draws the guide’s places as dots, never a saved or planned place twice', () => {
    const ids = places().map((place) => place.id);
    expect(ids).toEqual(['seniman', 'tirta', 'tegallalang', 'goa-gajah']);
    expect(places().find((place) => place.id === 'goa-gajah')).toMatchObject({
      tier: 'suggested',
      relevance: 0,
    });
  });

  it('steps the guide’s dots aside when asked (one day at half)', () => {
    expect(places(NO_FILTER, false).map((place) => place.id)).toEqual([
      'seniman',
      'tirta',
      'tegallalang',
    ]);
  });

  it('leaves lit exactly what a chip names and fades the rest', () => {
    const lit = (filter: MapFilter) => litPlaces(places(filter)).map((place) => place.id);
    expect(lit(NO_FILTER)).toHaveLength(4);
    expect(lit({ kind: 'saved' })).toEqual(['seniman', 'tirta', 'tegallalang']);
    expect(lit({ kind: 'crew' })).toEqual(['tirta', 'tegallalang']);
    expect(lit({ kind: 'guide' })).toEqual(['goa-gajah']);
    expect(lit({ kind: 'category', category: 'temple_shrine' })).toEqual(['tirta', 'goa-gajah']);
    // Faded, not removed: nothing jumps when a chip changes.
    expect(places({ kind: 'saved' })).toHaveLength(4);
  });

  it('offers the commonest saved categories as chips', () => {
    expect(categoryChips(places())).toEqual(['temple_shrine', 'food', 'nature']);
  });
});
