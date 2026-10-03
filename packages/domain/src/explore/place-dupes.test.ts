import { describe, expect, it } from 'vitest';

import { rankDeck, type DeckCandidate } from './deck';
import { distinctPlaces, type PlaceIdentity } from './place-dupes';

/** Four Đà Nẵng beach rows as the places index has them (three sources, one beach, and Non Nước). */
const MY_KHE_CITY = {
  id: 'my-khe-city',
  name: 'Mỹ Khê Beach, Đà Nẵng City',
  category: 'beach',
  lat: 16.05029296875,
  lng: 108.24894714355469,
};
const BAI_BIEN_MY_KHE = {
  id: 'bai-bien-my-khe',
  name: 'Bãi Biển Mỹ Khê Đà Nẵng',
  category: 'beach',
  lat: 16.056684494018555,
  lng: 108.24687957763672,
};
const MY_KHE = {
  id: 'my-khe',
  name: 'My Khe Beach',
  category: 'beach',
  lat: 16.06306457519531,
  lng: 108.24594116210938,
};
const NON_NUOC = {
  id: 'non-nuoc',
  name: 'Non Nước - My Khe Beach',
  category: 'beach',
  lat: 16.08138084411621,
  lng: 108.2470932006836,
};

describe('distinctPlaces', () => {
  it('keeps one of the rows that are the same place, the first in order', () => {
    const kept = distinctPlaces([MY_KHE_CITY, BAI_BIEN_MY_KHE, MY_KHE, NON_NUOC], 'Đà Nẵng');
    expect(kept.map((p) => p.id)).toEqual(['my-khe-city', 'non-nuoc']);
  });

  it('keeps places with the same name in another category or far apart', () => {
    const cafe: PlaceIdentity = { ...MY_KHE, name: 'My Khe', category: 'food' };
    const far = { ...MY_KHE, lat: MY_KHE.lat + 0.05 };
    expect(distinctPlaces([MY_KHE, cafe, far], 'Đà Nẵng')).toHaveLength(3);
  });

  it('keeps two cafés of one chain only when they are apart', () => {
    const a = { id: 'a', name: 'Cộng Cà Phê', category: 'food', lat: 16.06, lng: 108.22 };
    const near = { ...a, id: 'b', lat: 16.0601 };
    const across = { ...a, id: 'c', lat: 16.07 };
    expect(distinctPlaces([a, near, across], 'Đà Nẵng').map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('rankDeck with places', () => {
  const card = (place: PlaceIdentity & { id: string }, over: Partial<DeckCandidate> = {}) => ({
    poi_id: place.id,
    tags: [],
    must_see: false,
    distance_m: null,
    crew_saves: 0,
    in_plan: false,
    place,
    ...over,
  });

  it('never offers one place twice, nor a place the plan already has under another row', () => {
    const deck = rankDeck(
      [card(MY_KHE_CITY), card(BAI_BIEN_MY_KHE, { must_see: true }), card(MY_KHE), card(NON_NUOC)],
      {},
      2,
      30,
      'Đà Nẵng',
    );
    expect(deck.map((c) => c.poi_id)).toEqual(['bai-bien-my-khe', 'non-nuoc']);
    const planned = rankDeck(
      [card(MY_KHE_CITY), card(MY_KHE, { in_plan: true }), card(NON_NUOC)],
      {},
      2,
      30,
      'Đà Nẵng',
    );
    expect(planned.map((c) => c.poi_id)).toEqual(['non-nuoc']);
  });
});
