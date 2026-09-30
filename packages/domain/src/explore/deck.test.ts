import { describe, expect, it } from 'vitest';

import { matchRuleFor, rankDeck, type DeckCandidate } from './deck';
import { withSponsoredSlot } from './sponsored';

const poi = (n: number, over: Partial<DeckCandidate> = {}): DeckCandidate => ({
  poi_id: `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`,
  tags: [],
  must_see: false,
  distance_m: null,
  crew_saves: 0,
  in_plan: false,
  ...over,
});

describe('rankDeck', () => {
  it('drops places already in the plan and ranks taste, saves, must-sees and nearness', () => {
    const deck = rankDeck(
      [
        poi(1),
        poi(2, { in_plan: true, must_see: true }),
        poi(3, { tags: ['food'] }),
        poi(4, { crew_saves: 2 }),
        poi(5, { distance_m: 400 }),
      ],
      { food: 3 },
      3,
    );
    expect(deck.map((card) => card.poi_id.slice(-1))).toEqual(['4', '3', '5', '1']);
    expect(deck[0]?.reasons).toEqual([{ code: 'crew_saved', value: 2 }]);
    expect(deck[1]?.reasons).toEqual([{ code: 'taste', value: 'food' }]);
    expect(deck[2]?.reasons).toEqual([{ code: 'near_stay', value: 400 }]);
    expect(deck.map((card) => card.rank)).toEqual([1, 2, 3, 4]);
  });

  it('caps the deck at 30 cards, ties broken by id', () => {
    const deck = rankDeck(
      Array.from({ length: 40 }, (_, i) => poi(40 - i)),
      {},
      2,
    );
    expect(deck).toHaveLength(30);
    expect(deck[0]?.poi_id.endsWith('01')).toBe(true);
  });

  it('matches a solo traveller at one yes and any crew at two', () => {
    expect([1, 2, 5].map(matchRuleFor)).toEqual([1, 2, 2]);
  });
});

describe('withSponsoredSlot', () => {
  it('puts one labelled slot third, never first, and only when eligible', () => {
    const organic = ['a', 'b', 'c', 'd'];
    expect(withSponsoredSlot(organic, 's', true).map((e) => e.item)).toEqual([
      'a',
      'b',
      's',
      'c',
      'd',
    ]);
    expect(withSponsoredSlot(organic, 's', false).map((e) => e.kind)).not.toContain('sponsored');
    expect(withSponsoredSlot(['a'], 's', true).map((e) => e.item)).toEqual(['a', 's']);
    expect(withSponsoredSlot([], 's', true)).toEqual([]);
  });
});
