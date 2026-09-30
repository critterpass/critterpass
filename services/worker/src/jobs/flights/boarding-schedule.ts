/**
 * `boarding.schedule` (the timer at a watched flight's boarding time): when the flight is still to
 * leave, `flight.boarding_open` pings its travellers (N-41, "Tokek pings you when boarding opens"),
 * saying whether the time was the airline's or the departure − 40 min estimate. A flight that left,
 * landed, was cancelled or diverted meanwhile sends nothing.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { BOOKINGS_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export async function pingBoarding(
  pool: pg.Pool,
  timer: Pick<ScheduledJobData, 'ref_id'>,
): Promise<'pinged' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      booking_id: string;
      trip_id: string;
      crew_id: string;
      boarding_estimated: boolean;
    }>(
      `SELECT s.booking_id, s.trip_id, t.crew_id, s.boarding_estimated
         FROM flight_segments s JOIN bookings b ON b.id = s.booking_id JOIN trips t ON t.id = s.trip_id
        WHERE s.id = $1 AND b.deleted_at IS NULL
          AND s.status NOT IN ('departed', 'landed', 'cancelled', 'diverted')`,
      [timer.ref_id],
    );
    const segment = rows[0];
    if (segment === undefined) return 'gone';
    await appendDomainEvent(tx, {
      type: 'flight.boarding_open',
      aggregateKind: 'flight_segment',
      aggregateId: timer.ref_id,
      actorKind: 'system',
      actorId: null,
      crewId: segment.crew_id,
      tripId: segment.trip_id,
      payload: {
        trip_id: segment.trip_id,
        booking_id: segment.booking_id,
        segment_id: timer.ref_id,
        estimated: segment.boarding_estimated,
      },
    });
    return 'pinged';
  });
}

export function boardingScheduleJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: BOOKINGS_QUEUES.boardingSchedule,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await pingBoarding(ctx.pool, data) }),
  });
}
