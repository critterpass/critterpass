/**
 * Trip lifecycle machine (docs/data-model-sync-and-privacy.md §3.1): one JSON transition table
 * drives both this TS machine and the hand-written `app.trips_status_guard` SQL trigger
 * (packages/db/migrations/*_trips_and_participants.sql); `packages/db/test/trip-machine.test.ts`
 * proves the two agree on every (from, to) pair.
 */
import rawTransitions from './trip.transitions.json' with { type: 'json' };
import { type StateMachine, type Transition, createStateMachine } from './machine';
import type { TripPhase, TripStatus } from '../enums/trip';

const TRIP_TRANSITIONS = rawTransitions as readonly Transition<TripStatus>[];

export const tripStateMachine: StateMachine<TripStatus> = createStateMachine(TRIP_TRANSITIONS);

export function canTransitionTrip(from: TripStatus | null, to: TripStatus): boolean {
  return tripStateMachine.canTransition(from, to);
}

/** Throws `DomainError('STATE_INVALID')` for a pair the machine does not allow. */
export function transitionTrip(from: TripStatus | null, to: TripStatus): TripStatus {
  return tripStateMachine.transition(from, to).to;
}

/** Mirrors the `trips.phase` generated column so app code never has to trust a stale read. */
export function deriveTripPhase(status: TripStatus): TripPhase {
  switch (status) {
    case 'voting':
    case 'won':
    case 'setup':
    case 'drafting':
    case 'draft_review':
    case 'redrafting':
    case 'proposed':
    case 'confirmed':
      return 'planning';
    case 'pre_trip':
      return 'pre';
    case 'in_trip':
      return 'in';
    case 'post_trip':
    case 'archived':
      return 'post';
    case 'cancelled':
      return 'cancelled';
  }
}
