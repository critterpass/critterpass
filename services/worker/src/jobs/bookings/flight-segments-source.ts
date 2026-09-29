/**
 * The countdown's `FlightSegmentsSource`: every traveller's flight legs on the trip, read as the
 * system in the recompute job's transaction. A leg leaving the traveller's home airport is their
 * outbound one, a leg landing there their return; without a home airport the traveller's earliest
 * leg of the trip counts as outbound. Hops inside the trip never move a countdown.
 */
import { type FlightSegment, type FlightSegmentsSource } from '@cp/domain';
import type pg from 'pg';

interface LegRow {
  readonly user_id: string;
  readonly home_airport: string | null;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly sched_dep_at: Date;
  readonly est_dep_at: Date | null;
}

export function directionOf(
  leg: Pick<LegRow, 'home_airport' | 'dep_airport' | 'arr_airport'>,
  isEarliest: boolean,
): FlightSegment['direction'] {
  if (leg.home_airport !== null) {
    if (leg.dep_airport === leg.home_airport) return 'outbound';
    if (leg.arr_airport === leg.home_airport) return 'return';
    return 'internal';
  }
  return isEarliest ? 'outbound' : 'internal';
}

export const bookingFlightSegments: FlightSegmentsSource<pg.PoolClient> = async (tx, query) => {
  const { rows } = await tx.query<LegRow>(
    `SELECT traveller AS user_id, u.home_airport, s.dep_airport, s.arr_airport, s.sched_dep_at,
            s.est_dep_at
       FROM bookings b
       CROSS JOIN LATERAL unnest(b.traveller_ids) AS traveller
       JOIN flight_segments s ON s.booking_id = b.id
       LEFT JOIN users u ON u.id = traveller
      WHERE b.trip_id = $1 AND b.type = 'flight' AND b.deleted_at IS NULL
        AND b.status <> 'cancelled' AND traveller = ANY($2::uuid[])
      ORDER BY traveller, s.sched_dep_at`,
    [query.tripId, query.userIds],
  );
  const seen = new Set<string>();
  return rows.map((row) => {
    const isEarliest = !seen.has(row.user_id);
    seen.add(row.user_id);
    return {
      userId: row.user_id,
      departsAt: (row.est_dep_at ?? row.sched_dep_at).toISOString(),
      direction: directionOf(row, isEarliest),
    };
  });
};
