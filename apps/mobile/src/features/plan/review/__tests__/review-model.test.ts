/**
 * Review changes over the rain change set: each card's struck and new lines (the weekday only
 * when a change moves days), the summary numbers as changes are kept or dropped, the yeses the
 * default decider policy needs, the vote's tally and the state a chat card shows.
 */
import { describe, expect, it } from '@jest/globals';

import { MAYA, RIN, WINSTON, BALI_MEMBERS } from '../../overview/dev/bali-plan';
import { RAIN_BASE_ITEMS, RAIN_DAYS, RAIN_OPS, RAIN_POI_NAMES } from '../dev/rain-changeset';
import {
  buildChangeCards,
  changesetState,
  predictDecider,
  sideText,
  tallyOf,
  withToggles,
} from '../model/review-model';
import { reviewNumbers } from '../model/review-numbers';

const crew = BALI_MEMBERS.map((member) => member.user_id);
const weekday = (date: string | null) => (date === '2026-11-04' ? 'Wed' : 'Thu');

describe('change cards', () => {
  const cards = buildChangeCards(RAIN_OPS, RAIN_BASE_ITEMS, RAIN_POI_NAMES, 'Asia/Makassar');
  const lines = cards.map((card) => [
    card.before && sideText(card.before, RAIN_DAYS, card.movesDay, weekday),
    card.after && sideText(card.after, RAIN_DAYS, card.movesDay, weekday),
  ]);

  it('read as the design: old struck, new bold, the weekday only when the day moves', () => {
    expect(lines).toEqual([
      ['14:00 Ridge walk', '17:00 Ridge walk'],
      ['14:00 Free time', '14:00 Karsa Spa'],
      ['Wed 16:30 Monkey Forest', 'Thu 10:00 Monkey Forest'],
      ['19:30 Locavore NXT', '20:30 Locavore NXT'],
    ]);
    expect(cards.map((card) => card.accepted)).toEqual([true, true, true, false]);
    expect(cards[1]?.people).toEqual([MAYA, RIN]);
  });

  it('lay my queued toggles over the synced ones', () => {
    const toggled = withToggles(RAIN_OPS, [
      JSON.stringify({ payload: { change_id: RAIN_OPS[3]?.target, accepted: true } }),
      JSON.stringify({ payload: { change_id: RAIN_OPS[0]?.target, accepted: false } }),
    ]);
    expect(toggled.map((op) => op.accepted !== false)).toEqual([false, true, true, true]);
  });
});

describe('summary numbers', () => {
  it('count the kept changes only: the spa costs everyone $22 and the forest booking moves', () => {
    expect(reviewNumbers({ items: RAIN_BASE_ITEMS, ops: RAIN_OPS, crew, currency: 'USD' })).toEqual(
      { eachMinor: 2_200, currency: 'USD', bookingsMoved: 1, mustDosTouched: 0 },
    );
    const dropped = RAIN_OPS.map((op) => ({ ...op, accepted: false }));
    expect(reviewNumbers({ items: RAIN_BASE_ITEMS, ops: dropped, crew, currency: 'USD' })).toEqual({
      eachMinor: 0,
      currency: 'USD',
      bookingsMoved: 0,
      mustDosTouched: 0,
    });
  });
});

describe('decider', () => {
  const now = new Date('2026-10-20T00:00:00Z');

  it('asks a majority of everyone a paid change touches', () => {
    expect(
      predictDecider({
        ops: RAIN_OPS,
        baseItems: RAIN_BASE_ITEMS,
        crew,
        authorId: WINSTON,
        costDeltaMinor: 2_200,
        inTrip: false,
        now,
      }),
    ).toEqual({ kind: 'vote', needed: 4, affected: [...crew].sort() });
  });

  it('lets a free change that only touches me go straight in', () => {
    const mine = [{ ...RAIN_OPS[0]!, affected_user_ids: [WINSTON] }];
    const items = RAIN_BASE_ITEMS.map((item) => ({ ...item, attendeeIds: [WINSTON] }));
    expect(
      predictDecider({
        ops: mine,
        baseItems: items,
        crew,
        authorId: WINSTON,
        costDeltaMinor: 0,
        inTrip: false,
        now,
      }),
    ).toEqual({ kind: 'self' });
  });
});

describe('vote', () => {
  it('tallies yes and no by option position against the policy', () => {
    const tally = tallyOf(
      [
        { user_id: MAYA, position: 0 },
        { user_id: RIN, position: 1 },
      ],
      { decider_policy: 'majority_of_affected', threshold: null },
      crew,
    );
    expect(tally).toEqual({ yes: [MAYA], no: [RIN], needed: 4, eligible: crew });
  });

  it('shows an unanswered vote that ran out as expired', () => {
    expect(changesetState('voting', { status: 'open', close_reason: null })).toBe('voting');
    expect(changesetState('voting', { status: 'closed', close_reason: 'deadline' })).toBe(
      'expired',
    );
    expect(changesetState('rejected', { status: 'closed', close_reason: 'deadline' })).toBe(
      'expired',
    );
    expect(changesetState('applied', null)).toBe('approved');
    expect(changesetState('stale', null)).toBe('stale');
  });
});
