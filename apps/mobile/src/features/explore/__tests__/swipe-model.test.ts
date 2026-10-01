import { describe, expect, it } from '@jest/globals';

import {
  deckState,
  lastSwiped,
  nextMatch,
  othersYes,
  parseDeck,
  whyLines,
  withoutSwipe,
  withSwipe,
} from '../swipe-model';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`;
const card = (n: number) => ({ poi_id: id(n), rank: n, score: 10 - n, reasons: [], note: null });
const deck = [card(1), card(2), card(3)];

describe('the deck from the session row', () => {
  it('reads the cards in rank order', () => {
    expect(parseDeck(JSON.stringify([card(2), card(1)])).map((c) => c.rank)).toEqual([1, 2]);
  });

  it('is empty for anything it cannot read', () => {
    expect(parseDeck(null)).toEqual([]);
    expect(parseDeck('not json')).toEqual([]);
    expect(parseDeck(JSON.stringify([{ poi_id: 'x' }]))).toEqual([]);
  });
});

describe('which card is up', () => {
  it('starts on the first card and counts what is done', () => {
    const state = deckState(deck, {}, new Set());
    expect(state.remaining[0]?.poi_id).toBe(id(1));
    expect(state).toMatchObject({ total: 3, done: 0, finished: false });
  });

  it('moves on after a swipe and comes back on undo', () => {
    const swiped = withSwipe({}, id(1), 'no');
    expect(deckState(deck, swiped, new Set()).remaining[0]?.poi_id).toBe(id(2));
    expect(lastSwiped(swiped)).toBe(id(1));
    const undone = withoutSwipe(swiped, id(1));
    expect(deckState(deck, undone, new Set()).remaining[0]?.poi_id).toBe(id(1));
    expect(lastSwiped(undone)).toBeNull();
  });

  it('skips a place that is already in the plan, without counting it', () => {
    const state = deckState(deck, {}, new Set([id(1)]));
    expect(state.remaining.map((c) => c.poi_id)).toEqual([id(2), id(3)]);
    expect(state.total).toBe(2);
  });

  it('keeps a card the viewer swiped in the count even once it is in the plan', () => {
    const state = deckState(deck, { [id(1)]: 'yes' }, new Set([id(1)]));
    expect(state).toMatchObject({ total: 3, done: 1 });
  });

  it('finishes when every card is swiped, and never for an empty deck', () => {
    const all = { [id(1)]: 'yes', [id(2)]: 'no', [id(3)]: 'yes' } as const;
    expect(deckState(deck, all, new Set()).finished).toBe(true);
    expect(deckState([], {}, new Set()).finished).toBe(false);
  });

  it('undoes the most recent swipe, also after swiping a card again', () => {
    const swiped = withSwipe(withSwipe(withSwipe({}, id(1), 'yes'), id(2), 'no'), id(1), 'no');
    expect(lastSwiped(swiped)).toBe(id(1));
    expect(swiped[id(1)]).toBe('no');
  });
});

describe('who else said yes', () => {
  const votes = [
    { poiId: id(1), userId: 'rin' },
    { poiId: id(1), userId: 'me' },
    { poiId: id(1), userId: 'alex' },
    { poiId: id(2), userId: 'maya' },
  ];
  it("lists the card's other voters in the crew's order, never the viewer", () => {
    expect(othersYes(votes, id(1), 'me', ['maya', 'alex', 'rin'])).toEqual(['alex', 'rin']);
    expect(othersYes(votes, id(3), 'me', ['maya'])).toEqual([]);
  });
});

describe('matches', () => {
  const matches = [
    { id: 'm1', poiId: id(1), dayNo: 3 },
    { id: 'm2', poiId: id(2), dayNo: null },
  ];
  it('are stamped one at a time, each once', () => {
    expect(nextMatch(matches, new Set())?.id).toBe('m1');
    expect(nextMatch(matches, new Set(['m1']))?.id).toBe('m2');
    expect(nextMatch(matches, new Set(['m1', 'm2']))).toBeNull();
  });
});

describe('why this', () => {
  it('words only the signals it knows', () => {
    expect(
      whyLines([
        { code: 'must_see' },
        { code: 'taste', value: 'temples' },
        { code: 'crew_saved', value: 2 },
        { code: 'near_stay', value: 450 },
        { code: 'taste' },
      ]),
    ).toEqual([
      { kind: 'must_see' },
      { kind: 'taste', tag: 'temples' },
      { kind: 'crew_saved', count: 2 },
      { kind: 'near_stay', meters: 450 },
    ]);
  });
});
