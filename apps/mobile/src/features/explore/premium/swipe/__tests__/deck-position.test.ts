import { describe, expect, it } from '@jest/globals';

import { deckPosition } from '../swipe-page';

describe('the swipe deck counter', () => {
  it('counts the card on top, and the total once the deck is done', () => {
    expect(deckPosition('deck', 0, 30)).toBe(1);
    expect(deckPosition('deck', 11, 30)).toBe(12);
    expect(deckPosition('deck', 30, 30)).toBe(30);
    expect(deckPosition('summary', 30, 30)).toBe(30);
  });
});
