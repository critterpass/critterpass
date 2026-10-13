import { describe, expect, it } from '@jest/globals';

import { mergeDeckIds } from '../use-deck-cards';

describe('swipe deck order', () => {
  it('keeps voted cards in front and adds only new cards at the end', () => {
    const seen = ['a', 'b'];
    // After "a" is voted the session's next cards are b, c: c joins, b keeps its place.
    expect(mergeDeckIds(seen, ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('hands back the same list when nothing is new, so the deck is not redrawn', () => {
    const seen = ['a', 'b', 'c'];
    expect(mergeDeckIds(seen, ['b', 'c'])).toBe(seen);
    expect(mergeDeckIds(seen, [])).toBe(seen);
  });
});
