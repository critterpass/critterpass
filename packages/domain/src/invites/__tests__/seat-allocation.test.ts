import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  allocateSeat,
  canAcceptOffer,
  freeSeats,
  offersToMake,
  SEAT_CAP_BOOSTED,
  SEAT_CAP_FREE,
  seatLimitOfferFor,
  type ExistingParticipation,
  type SeatAllocation,
  type SeatState,
} from '../seat-allocation';

const none: ExistingParticipation = { kind: 'none' };

function state(overrides: Partial<SeatState>): SeatState {
  return {
    seatsHeld: 0,
    cap: SEAT_CAP_FREE,
    openOffers: 0,
    lastWaitlistPosition: null,
    ...overrides,
  };
}

describe('allocateSeat: the seat cap cases', () => {
  const cases: ReadonlyArray<[string, SeatState, ExistingParticipation, SeatAllocation]> = [
    ['seats the 6th person on an unboosted trip', state({ seatsHeld: 5 }), none, { kind: 'seat' }],
    [
      'waitlists the 7th person on an unboosted trip',
      state({ seatsHeld: 6 }),
      none,
      { kind: 'waitlist', position: 1 },
    ],
    [
      'seats the 7th person while the trip is boosted',
      state({ seatsHeld: 6, cap: SEAT_CAP_BOOSTED }),
      none,
      { kind: 'seat' },
    ],
    [
      'seats the 16th person while boosted',
      state({ seatsHeld: 15, cap: SEAT_CAP_BOOSTED }),
      none,
      { kind: 'seat' },
    ],
    [
      'waitlists the 17th person while boosted',
      state({ seatsHeld: 16, cap: SEAT_CAP_BOOSTED }),
      none,
      { kind: 'waitlist', position: 1 },
    ],
    [
      'queues behind people already waiting, even with a seat free',
      state({ seatsHeld: 5, lastWaitlistPosition: 3 }),
      none,
      { kind: 'waitlist', position: 4 },
    ],
    [
      'keeps a seat promised by an open offer for its holder',
      state({ seatsHeld: 5, openOffers: 1 }),
      none,
      { kind: 'waitlist', position: 1 },
    ],
    [
      'waitlists new joiners after a boost ends with more than six seated',
      state({ seatsHeld: 9, cap: SEAT_CAP_FREE }),
      none,
      { kind: 'waitlist', position: 1 },
    ],
    [
      'treats someone who went out and comes back as a new joiner',
      state({ seatsHeld: 5 }),
      { kind: 'out' },
      { kind: 'seat' },
    ],
    [
      'never re-seats someone seated',
      state({ seatsHeld: 6 }),
      { kind: 'seated' },
      { kind: 'already_seated' },
    ],
    [
      'keeps a waiter in their place',
      state({ seatsHeld: 6, lastWaitlistPosition: 2 }),
      { kind: 'waitlisted', position: 2 },
      { kind: 'already_waitlisted', position: 2 },
    ],
  ];

  it.each(cases)('%s', (_name, seats, existing, expected) => {
    expect(allocateSeat(seats, existing)).toEqual(expected);
  });
});

describe('free seats and offers', () => {
  it('frees a seat when someone RSVPs out, and offers it to the next waiter', () => {
    const before = state({ seatsHeld: 6, lastWaitlistPosition: 2 });
    expect(offersToMake(before, 2)).toBe(0);
    const afterOut = { ...before, seatsHeld: 5 };
    expect(offersToMake(afterOut, 2)).toBe(1);
    const offered = { ...afterOut, openOffers: 1 };
    expect(offersToMake(offered, 1)).toBe(0);
    expect(canAcceptOffer(offered)).toBe(true);
  });

  it('never counts a frozen seat as free after a boost ends', () => {
    expect(freeSeats(state({ seatsHeld: 12, cap: SEAT_CAP_FREE }))).toBe(0);
    expect(canAcceptOffer(state({ seatsHeld: 12, cap: SEAT_CAP_FREE }))).toBe(false);
  });

  it('offers a boost before the trip is boosted and the waitlist once it is', () => {
    expect(seatLimitOfferFor(false)).toBe('boost');
    expect(seatLimitOfferFor(true)).toBe('waitlist');
  });
});

describe('allocateSeat: sequential joins', { timeout: 60_000 }, () => {
  it('never seats more than the cap and numbers the waitlist without gaps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 16 }),
        fc.constantFrom(SEAT_CAP_FREE, SEAT_CAP_BOOSTED),
        fc.integer({ min: 1, max: 60 }),
        (held, cap, joiners) => {
          let seats = state({ seatsHeld: held, cap });
          const positions: number[] = [];
          for (let i = 0; i < joiners; i += 1) {
            const outcome = allocateSeat(seats, none);
            if (outcome.kind === 'seat') seats = { ...seats, seatsHeld: seats.seatsHeld + 1 };
            if (outcome.kind === 'waitlist') {
              positions.push(outcome.position);
              seats = { ...seats, lastWaitlistPosition: outcome.position };
            }
          }
          expect(seats.seatsHeld).toBe(Math.max(held, Math.min(cap, held + joiners)));
          expect(positions).toEqual(positions.map((_, index) => index + 1));
        },
      ),
    );
  });
});
