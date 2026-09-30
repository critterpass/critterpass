/**
 * `critter.hatch`: a `flight.landed` event hatches the egg of every traveller on that leg, on the
 * leg's trip, unless they have another leg departing within a day of landing (a connection: the
 * egg waits for the final leg). The first trigger wins; landing after an arrival or a manual hatch
 * finds the egg hatched and changes nothing.
 */
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import {
  CRITTER_QUEUES,
  flightLandedPayloadSchema,
  hatchJobSchema,
  type HatchTrigger,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

/** A later leg departing this soon after landing is a connection, not the end of the journey. */
export const CONNECTION_WINDOW_H = 24;

interface HatchRow {
  readonly egg_id: string;
  readonly form_id: string;
  readonly entry_id: string | null;
  readonly hatched: boolean;
}

/** Hatches one traveller's egg (granting it first if needed) and announces it. */
export async function hatchTraveller(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly uid: string;
    readonly trigger: HatchTrigger;
    readonly now: Date;
  },
): Promise<boolean> {
  const { rows } = await tx.query<HatchRow>('SELECT * FROM app.hatch_egg($1, $2, $3)', [
    input.uid,
    input.tripId,
    input.trigger,
  ]);
  const row = rows[0];
  if (row?.hatched !== true) return false;
  await appendDomainEvent(tx, {
    type: 'egg.hatched',
    aggregateKind: 'egg',
    aggregateId: row.egg_id,
    actorKind: 'system',
    actorId: null,
    tripId: input.tripId,
    payload: {
      trip_id: input.tripId,
      user_id: input.uid,
      egg_id: row.egg_id,
      form_id: row.form_id,
      trigger: input.trigger,
    },
  });
  if (row.entry_id !== null) {
    await sendInTx(
      tx,
      CRITTER_QUEUES.rewardFanout,
      { kind: 'critter_found', entry_ids: [row.entry_id], granted_at: input.now.toISOString() },
      { singletonKey: row.entry_id },
    );
  }
  return true;
}

export async function hatchOnLanded(
  pool: pg.Pool,
  eventId: string,
  now: Date = new Date(),
): Promise<{ readonly hatched: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ payload: unknown; trip_id: string | null }>(
      'SELECT payload, trip_id FROM app.domain_event_for_routing($1)',
      [eventId],
    );
    const event = rows[0];
    if (event?.trip_id === null || event === undefined) return { hatched: 0 };
    const landed = flightLandedPayloadSchema.parse(event.payload);
    let hatched = 0;
    for (const uid of [...landed.user_ids].sort()) {
      const { rows: onward } = await tx.query(
        `SELECT 1 FROM flight_segments s JOIN bookings b ON b.id = s.booking_id,
                flight_segments this
          WHERE this.id = $1 AND s.id <> this.id AND s.trip_id = this.trip_id
            AND (s.owner_id = $2 OR $2 = ANY (b.traveller_ids))
            AND s.sched_dep_at >= coalesce(this.act_arr_at, this.est_arr_at, this.sched_arr_at)
            AND s.sched_dep_at < coalesce(this.act_arr_at, this.est_arr_at, this.sched_arr_at)
                                 + make_interval(hours => $3)
          LIMIT 1`,
        [landed.segment_id, uid, CONNECTION_WINDOW_H],
      );
      if (onward.length > 0) continue;
      if (await hatchTraveller(tx, { tripId: event.trip_id, uid, trigger: 'landed', now })) {
        hatched += 1;
      }
    }
    return { hatched };
  });
}

export function hatchJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.hatch,
    schema: hatchJobSchema,
    singletonKey: (data) => data.event_id,
    async handler(data, { pool }) {
      return hatchOnLanded(pool, data.event_id);
    },
  });
}
