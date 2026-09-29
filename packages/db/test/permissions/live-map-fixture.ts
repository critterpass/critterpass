/**
 * Crew live map fixtures: move a trip into its trip days (through every legal status step) and
 * set or clear its Boost snapshot.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';

const TO_IN_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
] as const;

/** Local calendar date `offsetDays` from today in `tz`, as `YYYY-MM-DD`. */
export function localDate(tz: string, offsetDays: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(shifted);
}

/**
 * Started yesterday, last day `daysLeft` days from today (0 = today is the last day), in `tz`.
 */
export async function moveTripIntoTripDays(
  pool: pg.Pool,
  tripId: string,
  options: { readonly tz: string; readonly daysLeft: number },
): Promise<void> {
  await withSystem(pool, async (tx) => {
    await tx.query('UPDATE trips SET tz = $2, start_date = $3, end_date = $4 WHERE id = $1', [
      tripId,
      options.tz,
      localDate(options.tz, -1),
      localDate(options.tz, options.daysLeft),
    ]);
    const { rows } = await tx.query<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
      tripId,
    ]);
    const from = TO_IN_TRIP.indexOf(rows[0]!.status as (typeof TO_IN_TRIP)[number]);
    for (const status of TO_IN_TRIP.slice(from + 1)) {
      await tx.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
    }
  });
}

export async function boostTrip(pool: pg.Pool, tripId: string, active: boolean): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO trip_entitlements (trip_id, boost_active, live_map) VALUES ($1, $2, $2)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = $2, live_map = $2`,
      [tripId, active],
    ),
  );
}
