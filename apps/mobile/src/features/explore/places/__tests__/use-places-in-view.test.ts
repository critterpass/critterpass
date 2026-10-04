/**
 * The places map's and list's rules: each place once with its strongest standing, my hidden
 * places left out, a filter dimming instead of removing, the count of lit places in view, the
 * cards nearest first from the picked place, and results mode.
 */
import { describe, expect, it } from '@jest/globals';
import { tokens } from '@cp/design-tokens';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import type { MapPoi } from '../../map-model';
import { hubPlaces, placeCounts, type HubSources } from '../places-model';
import { placeDots, placesInView } from '../use-places-in-view';

const SAVER = tokens.member.colors[1] ?? '';

const poi = (id: string, name: string, lat: number, lng: number, category = 'temple_shrine') =>
  ({
    id,
    name,
    nameLocal: null,
    category,
    lat,
    lng,
    hours: null,
    mustSee: false,
    written: false,
  }) satisfies MapPoi;

// Around Ubud: a few hundred metres apart, the plan stop furthest east.
const curated = [
  poi('tirta', 'Tirta Empul', -8.415, 115.315),
  poi('kawi', 'Gunung Kawi', -8.423, 115.312),
  poi('seniman', 'Seniman Coffee', -8.507, 115.262, 'food'),
  poi('murni', "Murni's Warung", -8.503, 115.255, 'food'),
  poi('karsa', 'Karsa Spa', -8.49, 115.27, 'health'),
  poi('hidden', 'Monkey Forest', -8.519, 115.259, 'nature'),
];

const sources: HubSources = {
  curated,
  ideas: [
    {
      id: 'idea-1',
      poiId: 'tirta',
      name: 'Tirta Empul',
      category: 'temple_shrine',
      lat: -8.415,
      lng: 115.315,
      backerIds: ['alex', 'rin'],
    },
    // A pin someone dropped: no curated place behind it.
    {
      id: 'idea-pin',
      poiId: null,
      name: 'Secret beach',
      category: 'beach',
      lat: -8.8,
      lng: 115.1,
      backerIds: ['rin'],
    },
  ],
  stops: [
    {
      poiId: 'karsa',
      name: 'Karsa Spa',
      category: 'health',
      lat: -8.49,
      lng: 115.27,
      dayNo: 2,
    },
  ],
  hiddenIds: new Set(['hidden', 'seniman']),
};

describe('the places the map and list show', () => {
  const places = hubPlaces(sources);
  const byId = new Map(places.map((place) => [place.id, place]));

  it('lists each place once with its strongest standing and leaves out the places I hid', () => {
    expect(places.map((place) => place.id).sort()).toEqual(
      ['idea-pin', 'karsa', 'kawi', 'murni', 'tirta'].sort(),
    );
    expect(byId.get('karsa')?.standing).toBe('plan');
    expect(byId.get('tirta')?.standing).toBe('saved');
    expect(byId.get('tirta')?.backerIds).toEqual(['alex', 'rin']);
    expect(byId.get('kawi')?.standing).toBe('suggested');
  });

  it('keeps a hidden place that is in the plan: the plan is the crew', () => {
    const withPlanned = hubPlaces({ ...sources, hiddenIds: new Set(['karsa']) });
    expect(withPlanned.find((place) => place.id === 'karsa')?.standing).toBe('plan');
  });

  it('counts every chip on its own', () => {
    const counts = placeCounts(places);
    expect(counts).toMatchObject({ all: 5, saved: 2, plan: 1 });
    expect(counts.groups).toEqual([
      { group: 'temples', count: 2 },
      { group: 'beaches', count: 1 },
      { group: 'food', count: 1 },
      { group: 'wellness', count: 1 },
    ]);
  });

  it('dims the places a filter leaves out instead of removing them', () => {
    const dots = placeDots(places, 'saved', () => SAVER);
    expect(dots).toHaveLength(places.length);
    expect(
      dots
        .filter((dot) => dot.dimmed !== true)
        .map((dot) => dot.id)
        .sort(),
    ).toEqual(['idea-pin', 'tirta']);
    expect(dots.find((dot) => dot.id === 'kawi')).toMatchObject({ tier: 'suggested' });
    expect(dots.find((dot) => dot.id === 'tirta')).toMatchObject({
      tier: 'saved',
      badgeColor: SAVER,
    });
    expect(placeDots(places, 'all', () => undefined).every((dot) => dot.dimmed !== true)).toBe(
      true,
    );
  });

  it('counts the lit places inside the camera only', () => {
    const ubud: LngLatBounds = [115.24, -8.53, 115.28, -8.48];
    expect(
      placesInView({ places, filter: 'all', bounds: ubud, anchorId: null }).inView.map(
        (place) => place.id,
      ),
    ).toEqual(['karsa', 'murni']);
    expect(
      placesInView({ places, filter: 'food', bounds: ubud, anchorId: null }).inView.map(
        (place) => place.id,
      ),
    ).toEqual(['murni']);
  });

  it('orders the cards nearest first from the picked place', () => {
    const { carousel } = placesInView({
      places,
      filter: 'all',
      bounds: null,
      anchorId: 'tirta',
    });
    expect(carousel.map((place) => place.id)).toEqual([
      'tirta',
      'kawi',
      'karsa',
      'murni',
      'idea-pin',
    ]);
  });

  it('shows only the search results in results mode', () => {
    const results = hubPlaces({ ...sources, results: new Set(['kawi', 'murni']) });
    expect(results.map((place) => place.id).sort()).toEqual(['kawi', 'murni']);
  });
});
