/**
 * The one path a trip's status moves along outside setup and drafting: a compare-and-set update
 * (the `app.trips_status_guard` trigger still rejects any pair the machine does not allow) and the
 * `trip.status_changed` event, in the caller's transaction, so every same-tx hook (egg grants,
 * leave-by and day-bundle recompute, billing) and the activity ticker see it. The caller holds a
 * role that may update `trips` (app_system, or a command's `asSystemRole`).
 */
import { QUEST_QUEUES, type TripStatus } from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent, type AppendedDomainEvent } from '../events';
import { sendInTx } from '../jobs/send-in-tx';

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

/**
 * The quests of the day a trip got under way, written at once rather than at the hourly sweep's
 * next tick: an `onEventAppended` hook on `trip.status_changed` (the api and the worker both move
 * trips, so both register it) that queues `quests.generate` for the trip's local date when the
 * trip is now `in_trip`, on its dates, and has no quests for that day yet. The job's singleton key
 * is the sweep's (`trip:date`) and the generator publishes a day once, so the two never write a
 * day twice.
 */
export async function queueQuestsOnTripStart(
  tx: pg.PoolClient,
  event: AppendedDomainEvent,
): Promise<void> {
  if (event.type !== 'trip.status_changed' || event.tripId === null) return;
  const { rows } = await tx.query<{ local_date: string }>(
    `SELECT local.day::text AS local_date
       FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id
       CROSS JOIN LATERAL (
         SELECT (now() AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date AS day
       ) local
      WHERE t.id = $1 AND t.status = 'in_trip'
        AND local.day BETWEEN t.start_date AND t.end_date
        AND NOT EXISTS (SELECT 1 FROM quests q WHERE q.trip_id = t.id AND q.local_date = local.day)`,
    [event.tripId],
  );
  const day = rows[0];
  if (day === undefined) return;
  const job = { trip_id: event.tripId, local_date: day.local_date };
  await sendInTx(tx, QUEST_QUEUES.generate, job, {
    singletonKey: `${job.trip_id}:${job.local_date}`,
  });
}
