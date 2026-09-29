/**
 * `flight.event` (docs/api-contracts-async.md §2.2): an AeroAPI alert delivery. Nothing in the
 * delivery is trusted: the alert must belong to a live watch, and the flight is refetched by its
 * id from AeroAPI; a reading that is not the watched flight (another number, another day) is
 * dropped. The fresh reading is then applied to every watched segment on that flight.
 */
import { withSystem } from '@cp/db';
import { BOOKINGS_QUEUES } from '@cp/domain';
import type { AeroApiClient } from '@cp/suppliers';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { applyReading, readingMatches } from './apply';

const flightEventSchema = z.object({
  alert_id: z.string().max(64),
  fa_flight_id: z.string().max(128),
  event_code: z.string().max(40),
});
export type FlightEventJob = z.infer<typeof flightEventSchema>;

export async function handleFlightEvent(
  pool: pg.Pool,
  aero: AeroApiClient | undefined,
  event: FlightEventJob,
  now: Date,
): Promise<{ outcome: 'applied' | 'ignored'; changes: number }> {
  if (aero === undefined) return { outcome: 'ignored', changes: 0 };
  const watched = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      carrier: string;
      flight_no: string;
      sched_dep_at: Date;
    }>(
      `SELECT s.id, s.carrier, s.flight_no, s.sched_dep_at
         FROM flight_watches w JOIN flight_segments s ON s.id = w.flight_segment_id
        WHERE w.provider = 'flightaware' AND w.provider_alert_id = $1 AND w.ended_at IS NULL`,
      [event.alert_id],
    );
    return rows;
  });
  if (watched.length === 0) return { outcome: 'ignored', changes: 0 };
  const reading = await aero.flightById(event.fa_flight_id);
  if (reading === null) return { outcome: 'ignored', changes: 0 };
  const matching = watched.filter((segment) => readingMatches(segment, reading));
  if (matching.length === 0) return { outcome: 'ignored', changes: 0 };
  let changes = 0;
  for (const segment of matching) {
    changes += (await withSystem(pool, (tx) => applyReading(tx, segment.id, reading, now))).length;
  }
  return { outcome: 'applied', changes };
}

export function flightEventJob(aero: AeroApiClient | undefined): JobDefinition<FlightEventJob> {
  return defineJob({
    queue: BOOKINGS_QUEUES.flightEvent,
    schema: flightEventSchema,
    singletonKey: (data) => `${data.fa_flight_id}:${data.alert_id}:${data.event_code}`,
    handler: async (data, ctx) => handleFlightEvent(ctx.pool, aero, data, new Date()),
  });
}
