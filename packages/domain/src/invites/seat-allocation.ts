/**
 * Trip seats (the seat cap contract): seats are participants whose RSVP is neither `out` nor
 * `waitlisted`; a trip seats 6, or 16 while boosted. A join past the cap waitlists the joiner
 * behind everyone already waiting; nobody already seated is ever unseated, so when a boost ends
 * with more than 6 seated, those people keep their seats and new joiners wait. A seat freed by an
 * `out` becomes a time-boxed offer to the next person waiting, never an automatic join; seats
 * held by open offers are not free for anyone else.
 */
/** Seats on a trip that is not boosted, and while a boost is active (`seatCap(t)`). */
export const SEAT_CAP_FREE = 6;
export const SEAT_CAP_BOOSTED = 16;

export interface SeatState {
  /** Participants currently holding a seat. */
  readonly seatsHeld: number;
  readonly cap: number;
  /** Open, unexpired seat offers: seats promised to someone on the waitlist. */
  readonly openOffers: number;
  /** Highest waitlist position in use, or null when nobody waits. */
  readonly lastWaitlistPosition: number | null;
}

export type ExistingParticipation =
  | { readonly kind: 'none' }
  | { readonly kind: 'seated' }
  | { readonly kind: 'waitlisted'; readonly position: number }
  | { readonly kind: 'out' };

export type SeatAllocation =
  | { readonly kind: 'seat' }
  | { readonly kind: 'waitlist'; readonly position: number }
  | { readonly kind: 'already_seated' }
  | { readonly kind: 'already_waitlisted'; readonly position: number };

/** Seats nobody holds or has been offered; never negative (a frozen boost can leave it below 0). */
export function freeSeats(state: Pick<SeatState, 'seatsHeld' | 'cap' | 'openOffers'>): number {
  return Math.max(0, state.cap - state.seatsHeld - state.openOffers);
}

/**
 * Where a joiner lands. A seat is given only while one is free and nobody is already waiting for
 * it (waiters are served first, through offers); otherwise the joiner queues at the back.
 */
export function allocateSeat(state: SeatState, existing: ExistingParticipation): SeatAllocation {
  if (existing.kind === 'seated') return { kind: 'already_seated' };
  if (existing.kind === 'waitlisted') {
    return { kind: 'already_waitlisted', position: existing.position };
  }
  if (freeSeats(state) > 0 && state.lastWaitlistPosition === null) return { kind: 'seat' };
  return { kind: 'waitlist', position: (state.lastWaitlistPosition ?? 0) + 1 };
}

/** How many new seat offers to make now: one per free seat, never more than people waiting. */
export function offersToMake(state: SeatState, waiting: number): number {
  return Math.min(freeSeats(state), Math.max(0, waiting));
}

/** Whether accepting an offer may seat its holder: their promised seat is counted in `openOffers`. */
export function canAcceptOffer(state: Pick<SeatState, 'seatsHeld' | 'cap'>): boolean {
  return state.seatsHeld < state.cap;
}

/** What a full trip offers the inviter: a boost when it is not boosted yet, else the waitlist. */
export function seatLimitOfferFor(boostActive: boolean): 'boost' | 'waitlist' {
  return boostActive ? 'waitlist' : 'boost';
}

/**
 * Trip statuses a crew member takes a seat on directly: the plan is locked in (`confirmed`,
 * `pre_trip`) or the trip is under way (`in_trip`), so no proposal will reach them any more.
 * Earlier a seat comes from the proposal's RSVP (during setup crew membership is enough); later
 * the trip is closed.
 */
export const OPEN_SEAT_TRIP_STATUSES = ['confirmed', 'pre_trip', 'in_trip'] as const;

export function tripTakesJoiners(status: string): boolean {
  return (OPEN_SEAT_TRIP_STATUSES as readonly string[]).includes(status);
}
