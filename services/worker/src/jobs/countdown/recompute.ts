/**
 * `countdown.recompute` (docs/product-decisions.md, countdown target): when a trip's dates or destination move,
 * a flight is booked, changed or removed, an RSVP changes or a traveller's zone changes, every
 * affected participant's `countdown_target_at` is recomputed: their first outbound departure when
 * the bookings feature's `FlightSegmentsSource` knows one, otherwise 00:00 of the trip's first day
 * in the destination's zone. Home, the trip hub, the widget and the Live Activity all read it.
 */
import { outbox, sendInTx, withSystem } from '@cp/db';
import {
  COUNTDOWN_INPUT_EVENTS,
  COUNTDOWN_RECOMPUTE_QUEUE,
  countdownTarget,
  crewChannel,
  getFlightSegmentsSource,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

export const countdownJobSchema = z.object({ event_id: z.uuid() });
export type CountdownJob = z.infer<typeof countdownJobSchema>;

/** `onEventAppended` hook: one recompute per event that can move a countdown. */
export async function countdownEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!COUNTDOWN_INPUT_EVENTS.has(event.type)) return;
  const job: CountdownJob = { event_id: event.id };
  await sendInTx(tx, COUNTDOWN_RECOMPUTE_QUEUE, job, { singletonKey: event.id });
}

interface Scope {
  readonly tripIds: readonly string[];
  /** Null = every participant of those trips. */
  readonly userIds: readonly string[] | null;
}

async function scopeOf(tx: pg.PoolClient, eventId: string): Promise<Scope> {
  const { rows } = await tx.query<{ type: string; payload: Record<string, unknown> }>(
    'SELECT type, payload FROM app.domain_event_for_routing($1)',
    [eventId],
  );
  const event = rows[0];
  if (event === undefined) return { tripIds: [], userIds: null };
  const tripId = event.payload['trip_id'];
  if (event.type === 'user.tz_changed') {
    const uid = String(event.payload['user_id']);
    const trips = await tx.query<{ trip_id: string }>(
      `SELECT p.trip_id FROM trip_participants p JOIN trips t ON t.id = p.trip_id
        WHERE p.user_id = $1 AND t.status NOT IN ('post_trip', 'archived', 'cancelled')`,
      [uid],
    );
    return { tripIds: trips.rows.map((row) => row.trip_id), userIds: [uid] };
  }
  if (typeof tripId !== 'string') return { tripIds: [], userIds: null };
  const users = event.payload['user_ids'];
  const one = event.payload['user_id'];
  if (Array.isArray(users) && users.length > 0) {
    return { tripIds: [tripId], userIds: users.map(String) };
  }
  if (event.type === 'rsvp.changed' && typeof one === 'string') {
    return { tripIds: [tripId], userIds: [one] };
  }
  return { tripIds: [tripId], userIds: null };
}

/** Recomputes the targets of one trip's participants; returns how many moved. */
export async function recomputeTrip(
  tx: pg.PoolClient,
  tripId: string,
  userIds: readonly string[] | null,
): Promise<number> {
  const trip = await tx.query<{ crew_id: string; start_date: string | null; tz: string | null }>(
    `SELECT t.crew_id, t.start_date::text AS start_date, coalesce(t.tz, d.tz) AS tz
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = trip.rows[0];
  if (row === undefined) return 0;
  const participants = await tx.query<{ user_id: string; countdown_target_at: Date | null }>(
    `SELECT user_id, countdown_target_at FROM trip_participants
      WHERE trip_id = $1 AND ($2::uuid[] IS NULL OR user_id = ANY ($2::uuid[]))`,
    [tripId, userIds],
  );
  const uids = participants.rows.map((participant) => participant.user_id);
  const source = getFlightSegmentsSource<pg.PoolClient>();
  const flights =
    source === null || uids.length === 0 ? [] : await source(tx, { tripId, userIds: uids });
  let moved = 0;
  for (const participant of participants.rows) {
    const target = countdownTarget(participant.user_id, flights, {
      startDate: row.start_date,
      tz: row.tz,
    });
    if ((target?.getTime() ?? null) === (participant.countdown_target_at?.getTime() ?? null)) {
      continue;
    }
    await tx.query(
      'UPDATE trip_participants SET countdown_target_at = $3 WHERE trip_id = $1 AND user_id = $2',
      [tripId, participant.user_id, target],
    );
    moved += 1;
  }
  if (moved > 0) {
    await outbox(tx, crewChannel(row.crew_id), 'trip.summary', {
      trip_id: tripId,
      countdown: true,
    });
  }
  return moved;
}

export async function recomputeCountdowns(pool: pg.Pool, eventId: string): Promise<number> {
  return withSystem(pool, async (tx) => {
    const scope = await scopeOf(tx, eventId);
    let moved = 0;
    for (const tripId of scope.tripIds) moved += await recomputeTrip(tx, tripId, scope.userIds);
    return moved;
  });
}

export function countdownRecomputeJob(): JobDefinition<CountdownJob> {
  return defineJob({
    queue: COUNTDOWN_RECOMPUTE_QUEUE,
    schema: countdownJobSchema,
    singletonKey: (data: CountdownJob) => data.event_id,
    handler: async (data, ctx) => ({ moved: await recomputeCountdowns(ctx.pool, data.event_id) }),
  });
}
