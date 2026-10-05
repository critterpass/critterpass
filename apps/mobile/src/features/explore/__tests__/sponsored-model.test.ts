import { describe, expect, it } from '@jest/globals';

import type { PicksEntryWire } from '@cp/domain';

import { createImpressionGate, pickEntries, picksOrLocal, withSlot } from '../sponsored-model';

const item = (id: string) => ({
  poi_id: id,
  name: id,
  name_local: null,
  category: 'food',
  tags: [],
  must_see: true,
  why_go: null,
  taste_matches: 0,
});
const organic = (id: string): PicksEntryWire => ({ kind: 'organic', item: item(id) });
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

  it('keeps only the must-sees where the guide marks any', () => {
    const plain: PicksEntryWire = { kind: 'organic', item: { ...item('bar'), must_see: false } };
    expect(pickEntries([organic('a'), plain, organic('b')]).map((card) => card.poiId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('shows the recommended places as ranked where nothing is marked a must-see', () => {
    const pick = (id: string): PicksEntryWire => ({
      kind: 'organic',
      item: { ...item(id), must_see: false },
    });
    expect(pickEntries([pick('a'), pick('b'), paid('s'), pick('c')]).map((c) => c.poiId)).toEqual([
      'a',
      'b',
      's',
      'c',
    ]);
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

describe('picks when the server sent few or none', () => {
  const card = (id: string) => ({ poiId: id, name: id, category: 'food', sponsored: null });
  const local = ['x', 'y', 'z'].map((id) => ({ poiId: id, name: id, category: 'nature' }));

  it('draws the recommended places the phone holds when the server sent none', () => {
    expect(picksOrLocal([], local).map((pick) => pick.poiId)).toEqual(['x', 'y', 'z']);
  });

  it('leaves a full server row alone', () => {
    const server = ['a', 'b', 'c', 'd'].map(card);
    expect(picksOrLocal(server, local).map((pick) => pick.poiId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves out places in the plan and tops the row up without repeating a place', () => {
    const server = [card('a'), card('x')];
    expect(
      picksOrLocal(server, local, { skip: new Set(['a', 'y']) }).map((pick) => pick.poiId),
    ).toEqual(['x', 'z']);
  });
});
