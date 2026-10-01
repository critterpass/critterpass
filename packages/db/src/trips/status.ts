/**
 * The one path a trip's status moves along outside setup and drafting: a compare-and-set update
 * (the `app.trips_status_guard` trigger still rejects any pair the machine does not allow) and the
 * `trip.status_changed` event, in the caller's transaction, so every same-tx hook (egg grants,
 * leave-by and day-bundle recompute, billing) and the activity ticker see it. The caller holds a
 * role that may update `trips` (app_system, or a command's `asSystemRole`).
 */
import type { TripStatus } from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent } from '../events';

export type TripStatusActor =
  { readonly kind: 'system' } | { readonly kind: 'user'; readonly id: string };

/**
 * Moves the trip `from → to` only while it is still `from`; resolves to whether it moved. A trip
 * already moved on (by another trigger, device or run) changes nothing and appends nothing.
 */
export async function moveTripStatus(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly from: TripStatus;
    readonly to: TripStatus;
    readonly actor: TripStatusActor;
  },
): Promise<boolean> {
  const { rows } = await tx.query<{ crew_id: string }>(
    'UPDATE trips SET status = $3 WHERE id = $1 AND status = $2 RETURNING crew_id',
    [input.tripId, input.from, input.to],
  );
  const crewId = rows[0]?.crew_id;
  if (crewId === undefined) return false;
  await appendDomainEvent(tx, {
    type: 'trip.status_changed',
    aggregateKind: 'trip',
    aggregateId: input.tripId,
    actorKind: input.actor.kind,
    actorId: input.actor.kind === 'user' ? input.actor.id : null,
    payload: { trip_id: input.tripId, from: input.from, to: input.to },
    crewId,
    tripId: input.tripId,
  });
  return true;
}

/** `proposed → confirmed`: the reply-by deadline passing, or the organiser locking the trip. */
export function confirmTrip(
  tx: pg.PoolClient,
  tripId: string,
  actor: TripStatusActor,
): Promise<boolean> {
  return moveTripStatus(tx, { tripId, from: 'proposed', to: 'confirmed', actor });
}
