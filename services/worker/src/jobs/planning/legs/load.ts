/**
 * What the legs job reads for a trip: its live plan versions (organiser drafts, proposals and the
 * current plan), each version's days with their stops in time order, the night's stay per day and
 * the destination's drive factor. A stop is any item with a place (curated or a dropped pin) that
 * is not the stay itself and not cancelled.
 */
import { tripStay } from '@cp/db';
import type pg from 'pg';

import type { DayStop, LegPoint, PlannedDay } from './pairs';

export const LIVE_VERSION_STATUSES = ['draft', 'proposed', 'current'] as const;

export interface TripLegsInput {
  readonly tripId: string;
  readonly driveFactor: number;
  readonly versions: readonly { readonly versionId: string; readonly days: PlannedDay[] }[];
}

interface DayRow {
  readonly id: string;
  readonly version_id: string;
  readonly date: string | null;
}

interface StopRow {
  readonly version_id: string;
  readonly day_id: string;
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
}

export async function loadTripLegsInput(
  tx: pg.PoolClient,
  tripId: string,
): Promise<TripLegsInput | null> {
  const { rows: trips } = await tx.query<{ drive_factor: number | null }>(
    `SELECT d.drive_factor FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  const trip = trips[0];
  if (trip === undefined) return null;
  const { rows: versions } = await tx.query<{ id: string }>(
    `SELECT id FROM itinerary_versions WHERE trip_id = $1 AND status = ANY($2::text[])
      ORDER BY created_at, id`,
    [tripId, LIVE_VERSION_STATUSES],
  );
  const versionIds = versions.map((version) => version.id);
  const { rows: days } = await tx.query<DayRow>(
    `SELECT id, version_id, to_char(date, 'YYYY-MM-DD') AS date FROM plan_days
      WHERE version_id = ANY($1::uuid[]) ORDER BY version_id, day_no`,
    [versionIds],
  );
  const { rows: stops } = await tx.query<StopRow>(
    `SELECT i.version_id, i.day_id, i.stable_id::text AS key,
            coalesce(p.lat, (i.custom_place ->> 'lat')::float8) AS lat,
            coalesce(p.lng, (i.custom_place ->> 'lng')::float8) AS lng
       FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.version_id = ANY($1::uuid[]) AND i.status IS DISTINCT FROM 'cancelled'
        AND i.category IS DISTINCT FROM 'stay' AND p.category IS DISTINCT FROM 'stay'
        AND coalesce(p.lat, (i.custom_place ->> 'lat')::float8) IS NOT NULL
        AND coalesce(p.lng, (i.custom_place ->> 'lng')::float8) IS NOT NULL
      ORDER BY i.version_id, i.day_id, i.starts_at NULLS LAST, i.stable_id`,
    [versionIds],
  );

  const stays = new Map<string, LegPoint | null>();
  const stayOn = async (versionId: string, date: string | null): Promise<LegPoint | null> => {
    const key = `${versionId}:${date ?? ''}`;
    if (!stays.has(key)) {
      const stay = await tripStay(tx, tripId, date ?? undefined, versionId);
      stays.set(key, stay === null ? null : { lat: stay.lat, lng: stay.lng });
    }
    return stays.get(key) ?? null;
  };

  const stopsByDay = new Map<string, DayStop[]>();
  for (const stop of stops) {
    const list = stopsByDay.get(stop.day_id) ?? [];
    list.push({ key: stop.key, lat: stop.lat, lng: stop.lng });
    stopsByDay.set(stop.day_id, list);
  }
  const result: { versionId: string; days: PlannedDay[] }[] = [];
  for (const versionId of versionIds) {
    const planned: PlannedDay[] = [];
    for (const day of days.filter((row) => row.version_id === versionId)) {
      planned.push({
        dayId: day.id,
        stay: await stayOn(versionId, day.date),
        stops: stopsByDay.get(day.id) ?? [],
      });
    }
    result.push({ versionId, days: planned });
  }
  return { tripId, driveFactor: trip.drive_factor ?? 1, versions: result };
}
