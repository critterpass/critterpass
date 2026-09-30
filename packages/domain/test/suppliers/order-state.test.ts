/**
 * The supplier order machine: supplier answers move a placed order only along legal transitions,
 * finished orders never move again, and a hold is kept only when it leaves the crew time to vote,
 * with the vote closing before the hold lapses and the release just before it.
 */
import { describe, expect, it } from 'vitest';

import {
  assertTransition,
  holdLeavesVoteWindow,
  holdReleaseAt,
  statusForOutcome,
  SUPPLIER_ORDER_TRANSITIONS,
  voteDeadlineForHold,
} from '../../src/suppliers';

describe('supplier order machine', () => {
  it('settles a placed order from the supplier answer', () => {
    expect(statusForOutcome('booking', 'confirmed')).toBe('confirmed');
    expect(statusForOutcome('booking', 'pending')).toBe('pending_operator');
    expect(statusForOutcome('booking', 'rejected')).toBe('rejected');
    expect(statusForOutcome('booking', 'failed')).toBe('rejected');
    expect(statusForOutcome('pending_operator', 'pending')).toBeNull();
    expect(statusForOutcome('pending_operator', 'confirmed')).toBe('confirmed');
    expect(statusForOutcome('pending_operator', 'cancelled')).toBe('cancelled');
    // A booking still in flight is not cancelled by a stale event.
    expect(statusForOutcome('booking', 'cancelled')).toBeNull();
  });

  it('never moves a finished order', () => {
    for (const final of ['rejected', 'cancelled', 'hold_expired', 'released'] as const) {
      expect(SUPPLIER_ORDER_TRANSITIONS[final]).toEqual([]);
      expect(() => assertTransition(final, 'confirmed')).toThrow(/STATE_INVALID/);
    }
  });
});

describe('hold windows', () => {
  const now = new Date('2026-10-12T08:00:00Z');

  it('keeps a hold only when it leaves the minimum vote window', () => {
    expect(holdLeavesVoteWindow(new Date('2026-10-12T08:20:00Z'), now)).toBe(false);
    expect(holdLeavesVoteWindow(new Date('2026-10-12T09:00:00Z'), now)).toBe(true);
    expect(holdLeavesVoteWindow(new Date('2026-10-12T08:45:00Z'), now, 30)).toBe(true);
    expect(holdLeavesVoteWindow(null, now)).toBe(false);
  });

  it('closes the vote before the hold lapses and releases just before the deadline', () => {
    const until = new Date('2026-10-12T10:00:00Z');
    expect(voteDeadlineForHold(until).getTime()).toBeLessThan(until.getTime());
    expect(holdReleaseAt(until, now)).toEqual(new Date('2026-10-12T09:58:00Z'));
    expect(holdReleaseAt(new Date('2026-10-12T08:01:00Z'), now)).toEqual(now);
  });
});
