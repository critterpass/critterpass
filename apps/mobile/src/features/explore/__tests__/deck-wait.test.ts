/**
 * The swipe screen's wait for cards: the guide still picking, the cards on their way to the phone,
 * or a deck that is not coming (past four minutes), when the person is offered a fresh start.
 */
import { describe, expect, it } from '@jest/globals';

import { deckWait } from '../deck-wait';

const started = '2026-10-05T05:42:53Z';
const at = (seconds: number) => new Date(Date.parse(started) + seconds * 1000);

describe('waiting for swipe cards', () => {
  it('says the guide is picking while the deck is empty', () => {
    // Staging's deck for this walk took 118 s; the member had given up at 90.
    expect(deckWait({ startedAt: started, cards: 0, now: at(90) })).toBe('building');
  });

  it('says the cards are coming once the deck has them but the places have not landed', () => {
    expect(deckWait({ startedAt: started, cards: 30, now: at(120) })).toBe('arriving');
  });

  it('calls it stuck after four minutes, with or without a deck', () => {
    expect(deckWait({ startedAt: started, cards: 0, now: at(241) })).toBe('stuck');
    expect(deckWait({ startedAt: started, cards: 30, now: at(300) })).toBe('stuck');
  });

  it('waits when the session has not synced yet', () => {
    expect(deckWait({ startedAt: null, cards: 0, now: at(9999) })).toBe('building');
  });
});
