/**
 * `trips.lifecycle_signal`: the event-driven trip moves of docs/data-model-sync-and-privacy.md §3.1.
 *
 * - A traveller's inbound landing (`flight.landed`) starts a `pre_trip` trip: the final leg of a
 *   journey (no onward leg of theirs departs within a day of landing: that is a connection) that
 *   does not land back where their first leg on the trip left from, landing no earlier than the day
 *   before the first day. The first landing wins; a crewmate's later landing finds it under way.
 * - A device arrival (`egg.hatched` with trigger `arrived`, the destination geofence) starts a
 *   `pre_trip` trip from 00:00 on its first day; an arrival earlier than that (someone who lives
 *   there, or came early) leaves it to the landing, the organiser or the noon fallback.
 * - A return landing (the final leg landing where the traveller's first leg on the trip left from)
 *   on or after the last day ends an `in_trip` trip early; an earlier one (a member leaving early)
 *   leaves the trip running until the midnight rule.
 */
import { moveTripStatus, withSystem } from '@cp/db';
import {
  flightLandedPayloadSchema,
  TRIP_LIFECYCLE_QUEUES,
  tripLifecycleSignalJobSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { CONNECTION_WINDOW_H } from '../critters/hatch-on-landed';

export type SignalOutcome = 'started' | 'ended' | 'none';

interface SignalEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly trip_id: string | null;
  readonly occurred_at: Date;
}

interface LegRow {
  readonly leg: 'connection' | 'inbound' | 'return';
  readonly landed_date: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly status: string;
}

/** How one traveller's landed leg reads, in the trip's own time zone. */
async function classifyLeg(
  tx: pg.PoolClient,
  segmentId: string,
  uid: string,
  fallbackAt: Date,
): Promise<LegRow | undefined> {
  const { rows } = await tx.query<LegRow>(
    `WITH this AS (
       SELECT s.*, coalesce(s.act_arr_at, s.est_arr_at, s.sched_arr_at, $4) AS landed_at
         FROM flight_segments s WHERE s.id = $1),
     legs AS (
       SELECT s.* FROM flight_segments s JOIN bookings b ON b.id = s.booking_id, this
        WHERE s.trip_id = this.trip_id AND (s.owner_id = $2 OR $2 = ANY (b.traveller_ids)))
     SELECT CASE
              WHEN EXISTS (SELECT 1 FROM legs l WHERE l.id <> this.id
                             AND l.sched_dep_at >= this.landed_at
                             AND l.sched_dep_at < this.landed_at + make_interval(hours => $3))
                THEN 'connection'
              WHEN this.arr_airport = (SELECT l.dep_airport FROM legs l
                                        ORDER BY l.sched_dep_at, l.id LIMIT 1)
                THEN 'return'
              ELSE 'inbound'
            END AS leg,
            (this.landed_at AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date::text AS landed_date,
            t.start_date::text AS start_date, t.end_date::text AS end_date, t.status
       FROM this JOIN trips t ON t.id = this.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id`,
    [segmentId, uid, CONNECTION_WINDOW_H, fallbackAt],
  );
  return rows[0];
}

const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

async function onLanded(
  tx: pg.PoolClient,
  tripId: string,
  event: SignalEvent,
): Promise<SignalOutcome> {
  const landed = flightLandedPayloadSchema.parse(event.payload);
  for (const uid of [...landed.user_ids].sort()) {
    const leg = await classifyLeg(tx, landed.segment_id, uid, event.occurred_at);
    if (leg === undefined || leg.leg === 'connection') continue;
    if (leg.leg === 'inbound' && leg.status === 'pre_trip') {
      if (leg.start_date === null || leg.landed_date < dayBefore(leg.start_date)) continue;
      const moved = await moveTripStatus(tx, {
        tripId,
        from: 'pre_trip',
        to: 'in_trip',
        actor: { kind: 'system' },
      });
      return moved ? 'started' : 'none';
    }
    if (leg.leg === 'return' && leg.status === 'in_trip') {
      if (leg.end_date === null || leg.landed_date < leg.end_date) continue;
      const moved = await moveTripStatus(tx, {
        tripId,
        from: 'in_trip',
        to: 'post_trip',
        actor: { kind: 'system' },
      });
      return moved ? 'ended' : 'none';
    }
  }
  return 'none';
}

async function onArrived(tx: pg.PoolClient, tripId: string, now: Date): Promise<SignalOutcome> {
  const { rows } = await tx.query<{ started: boolean }>(
    `SELECT t.start_date IS NOT NULL
            AND (t.start_date::timestamp AT TIME ZONE coalesce(t.tz, d.tz, 'UTC')) <= $2 AS started
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND t.status = 'pre_trip'`,
    [tripId, now],
  );
  if (rows[0]?.started !== true) return 'none';
  const moved = await moveTripStatus(tx, {
    tripId,
    from: 'pre_trip',
    to: 'in_trip',
    actor: { kind: 'system' },
  });
  return moved ? 'started' : 'none';
}

/** Reads one appended event and applies the move it signals, if any. */
export async function applyLifecycleSignal(
  pool: pg.Pool,
  eventId: string,
  now: Date = new Date(),
): Promise<SignalOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<SignalEvent>(
      'SELECT type, payload, trip_id, occurred_at FROM app.domain_event_for_routing($1)',
      [eventId],
    );
    const event = rows[0];
    if (event?.trip_id === null || event === undefined) return 'none';
    if (event.type === 'flight.landed') return onLanded(tx, event.trip_id, event);
    if (event.type === 'egg.hatched' && event.payload['trigger'] === 'arrived') {
      return onArrived(tx, event.trip_id, now);
    }
    return 'none';
  });
}

export function tripLifecycleSignalJob(): AnyJobDefinition {
  return defineJob({
    queue: TRIP_LIFECYCLE_QUEUES.signal,
    schema: tripLifecycleSignalJobSchema,
    singletonKey: (data) => data.event_id,
    async handler(data, { pool }) {
      return { outcome: await applyLifecycleSignal(pool, data.event_id) };
    },
  });
}
