import { describe, expect, it } from 'vitest';

import { TRIP_STATUSES, type TripStatus } from '../../src/enums/trip';
import { canTransitionTrip, deriveTripPhase, transitionTrip } from '../../src/state/trip';

const LEGAL_PAIRS: ReadonlySet<string> = new Set([
  '\u0000voting',
  '\u0000setup',
  'voting\u0000won',
  'won\u0000setup',
  'setup\u0000drafting',
  'drafting\u0000draft_review',
  'drafting\u0000setup',
  'draft_review\u0000redrafting',
  'redrafting\u0000draft_review',
  'draft_review\u0000proposed',
  'proposed\u0000draft_review',
  'proposed\u0000confirmed',
  'confirmed\u0000pre_trip',
  'pre_trip\u0000in_trip',
  'in_trip\u0000post_trip',
  'post_trip\u0000archived',
  'setup\u0000cancelled',
  'proposed\u0000cancelled',
  'confirmed\u0000cancelled',
  'pre_trip\u0000cancelled',
]);

describe('trip state machine', () => {
  it('accepts every documented transition', () => {
    expect(canTransitionTrip(null, 'voting')).toBe(true);
    expect(canTransitionTrip(null, 'setup')).toBe(true);
    expect(canTransitionTrip('voting', 'won')).toBe(true);
    expect(canTransitionTrip('proposed', 'confirmed')).toBe(true);
    expect(canTransitionTrip('pre_trip', 'cancelled')).toBe(true);
  });

  it('rejects an out-of-band jump', () => {
    expect(canTransitionTrip('voting', 'archived')).toBe(false);
    expect(canTransitionTrip('in_trip', 'setup')).toBe(false);
  });

  it('rejects reversing a terminal state', () => {
    expect(canTransitionTrip('archived', 'in_trip')).toBe(false);
    expect(canTransitionTrip('cancelled', 'setup')).toBe(false);
  });

  it('throws STATE_INVALID for an illegal transition', () => {
    expect(() => transitionTrip('voting', 'archived')).toThrow('STATE_INVALID');
  });

  it('rejects a null starting state outside the two designed entry points', () => {
    expect(canTransitionTrip(null, 'won')).toBe(false);
    expect(canTransitionTrip(null, 'cancelled')).toBe(false);
  });

  it('agrees with the exhaustive (from, to) table used to build the SQL trigger', () => {
    const statuses: readonly TripStatus[] = TRIP_STATUSES;
    for (const from of [null, ...statuses]) {
      for (const to of statuses) {
        // A no-op (from === to) is always legal — see machine.ts's isNoOp — mirroring the SQL
        // guard's own `OLD.status = NEW.status` passthrough.
        const expected = from === to || LEGAL_PAIRS.has(`${from ?? ''}\u0000${to}`);
        expect(canTransitionTrip(from, to)).toBe(expected);
      }
    }
  });

  it('derives phase from status exactly like the generated column', () => {
    const expected: Record<TripStatus, string> = {
      voting: 'planning',
      won: 'planning',
      setup: 'planning',
      drafting: 'planning',
      draft_review: 'planning',
      redrafting: 'planning',
      proposed: 'planning',
      confirmed: 'planning',
      pre_trip: 'pre',
      in_trip: 'in',
      post_trip: 'post',
      archived: 'post',
      cancelled: 'cancelled',
    };
    for (const status of TRIP_STATUSES) {
      expect(deriveTripPhase(status)).toBe(expected[status]);
    }
  });
});
