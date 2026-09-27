/**
 * Trip policy rules (docs/data-model.md §3.3, docs/data-model-sync-and-privacy.md §3.1). Status
 * legality itself is `canTransitionTrip` (../state/trip); this file only decides *who* may ask for
 * a transition, mirroring the RLS backstop in packages/db/migrations/*_trips_and_participants.sql.
 */
import { canTransitionTrip } from '../state/trip';
import type { TripStatus } from '../enums/trip';
import { ALLOW, deny, type PolicyActor, type PolicyResult } from './types';

export interface TripParticipantFact {
  readonly role: 'organiser' | 'member';
}

export interface TripCreateFacts {
  readonly actorIsCrewMember: boolean;
}

/** Any active crew member may start a trip for their own crew (RLS: `trips_insert`). */
export function canCreateTrip(_actor: PolicyActor, facts: TripCreateFacts): PolicyResult {
  return facts.actorIsCrewMember ? ALLOW : deny('NOT_FOUND');
}

export interface TripTransitionFacts {
  /** `null` when the actor is not a trip member — an outsider must never learn the trip exists. */
  readonly actorParticipant: TripParticipantFact | null;
  readonly from: TripStatus | null;
  readonly to: TripStatus;
}

/**
 * Only a trip organiser may drive the status machine (RLS: `trips_update` USING
 * `app.is_trip_organiser(id)`): a member sees `FORBIDDEN` (they already know the trip exists), an
 * outsider sees `NOT_FOUND`, and an organiser asking for an illegal pair sees `STATE_INVALID`.
 */
export function canTransitionTripStatus(
  _actor: PolicyActor,
  facts: TripTransitionFacts,
): PolicyResult {
  if (facts.actorParticipant === null) return deny('NOT_FOUND');
  if (facts.actorParticipant.role !== 'organiser') return deny('FORBIDDEN');
  return canTransitionTrip(facts.from, facts.to) ? ALLOW : deny('STATE_INVALID');
}

export interface TripRsvpFacts {
  readonly actorParticipant: TripParticipantFact | null;
  readonly targetUserId: string;
}

/**
 * RSVP is always self-service, even for an organiser who otherwise manages the trip (tighter than
 * the RLS backstop's `trip_participants_update`, which also lets an organiser touch any row — the
 * app layer is where "an organiser cannot RSVP on someone else's behalf" lives).
 */
export function canSetRsvp(actor: PolicyActor, facts: TripRsvpFacts): PolicyResult {
  if (facts.actorParticipant === null) return deny('NOT_FOUND');
  return facts.targetUserId === actor.uid ? ALLOW : deny('FORBIDDEN');
}
