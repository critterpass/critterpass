/** A trip's own boosts (bought, moved in, or granted by support): its window and status. */
import type { TripBoostSource, TripBoostStatus } from '../../sources';
import { iso, type RunQuery } from './query';

interface Row {
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly status: TripBoostStatus;
}

export async function loadTripBoostSources(
  run: RunQuery,
  tripId: string,
): Promise<TripBoostSource[]> {
  const rows = await run<Row>(
    `SELECT starts_at, ends_at, status FROM trip_boosts
      WHERE trip_id = $1 AND status IN ('scheduled', 'active', 'ended')`,
    [tripId],
  );
  return rows.map((row) => ({
    kind: 'trip_boost',
    tripId,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
  }));
}
