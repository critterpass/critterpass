import { describe, expect, it } from '@jest/globals';

import type { PicksEntryWire } from '@cp/domain';

import { createImpressionGate, pickEntries, withSlot } from '../sponsored-model';

const organic = (id: string): PicksEntryWire => ({
  kind: 'organic',
  item: {
    poi_id: id,
    name: id,
    name_local: null,
    category: 'food',
    tags: [],
    must_see: false,
    why_go: null,
    taste_matches: 0,
  },
});
const paid = (id: string): PicksEntryWire => ({
  kind: 'sponsored',
  label: 'SPONSORED',
  item: {
    placement_id: `placement-${id}`,
    partner: 'klook',
    poi_id: id,
    name: id,
    category: 'food',
    disclosure: 'sponsored_contextual',
  },
});

describe('picks with a sponsored slot', () => {
  it('keeps the server order and labels the one sponsored card', () => {
    const cards = pickEntries([organic('a'), organic('b'), paid('s'), organic('c')]);
    expect(cards.map((card) => card.poiId)).toEqual(['a', 'b', 's', 'c']);
    expect(cards.map((card) => card.sponsored !== null)).toEqual([false, false, true, false]);
    expect(cards[2]?.sponsored).toEqual({ placementId: 'placement-s', partner: 'klook' });
  });

  it('never shows a second sponsored card, or one in first place', () => {
    expect(
      pickEntries([organic('a'), paid('s'), paid('t'), organic('b')]).map((card) => card.poiId),
    ).toEqual(['a', 's', 'b']);
    expect(pickEntries([paid('s'), organic('a')]).map((card) => card.poiId)).toEqual(['a']);
    expect(pickEntries([paid('s')])).toEqual([]);
  });

  it('shows none for someone who gets none', () => {
    expect(pickEntries([organic('a'), organic('b')]).every((card) => card.sponsored === null)).toBe(
      true,
    );
  });
});

describe('a slot fetched for a list the app builds', () => {
  const list = pickEntries([organic('a'), organic('b'), organic('c')]);
  const slot = { poiId: 's', name: 's', category: 'food', placementId: 'p', partner: 'klook' };

  it('goes third, or last in a shorter list, and never into an empty one', () => {
    expect(withSlot(list, slot).map((card) => card.poiId)).toEqual(['a', 'b', 's', 'c']);
    expect(withSlot(list.slice(0, 1), slot).map((card) => card.poiId)).toEqual(['a', 's']);
    expect(withSlot([], slot)).toEqual([]);
    expect(withSlot(list, null)).toEqual(list);
  });

  it('is left out when the place is already in the list', () => {
    expect(withSlot(list, { ...slot, poiId: 'b' })).toEqual(list);
  });
});

describe('impressions', () => {
  it('count once per placement and list', () => {
    const first = createImpressionGate();
    expect(first('p', 'picks')).toBe(true);
    expect(first('p', 'picks')).toBe(false);
    expect(first('p', 'search')).toBe(true);
    expect(first('q', 'picks')).toBe(true);
  });
});
