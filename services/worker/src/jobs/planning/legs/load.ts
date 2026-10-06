/**
 * What the legs job reads for a trip: its live plan versions (organiser drafts, proposals and the
 * current plan), each version's days with their stops in time order, the night's stay per day and
 * the destination's drive factor, and the road shapes its legs already have. A stop is any item
 * with a place (curated or a dropped pin) that is not the stay itself and not cancelled. The item's
 * own kind says whether it is the stay: a visit to a place the catalogue files as a stay (a famous
 * villa) is a stop like any other, and only an item without a kind goes by its place.
 */
import { tripAreas, tripStay } from '@cp/db';
import { legModeSchema } from '@cp/domain';
import type pg from 'pg';

import type { DayStop, LegPoint, PlannedDay } from './pairs';
import { storedShapeKey, type StoredShapes } from './shapes';

export const LIVE_VERSION_STATUSES = ['draft', 'proposed', 'current'] as const;

export interface TripLegsInput {
  readonly tripId: string;
  readonly driveFactor: number;
  readonly versions: readonly { readonly versionId: string; readonly days: PlannedDay[] }[];
  /** Road shapes the trip's legs already have, reused while a leg's mode and metres hold. */
  readonly storedShapes: StoredShapes;
}

interface DayRow {
  readonly id: string;
  readonly version_id: string;
  readonly date: string | null;
  readonly destination_id: string | null;
}

/** The day trips of one version: each day spent away from its stop's city, with its link. */
async function awayDays(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
): Promise<Map<string, NonNullable<PlannedDay['away']>>> {
  const areas = await tripAreas(tx, tripId, versionId, { withGuides: false });
  const away = new Map<string, NonNullable<PlannedDay['away']>>();
  for (const day of areas?.days ?? []) {
    const stop = areas?.stops.find((s) => s.position === day.stopPosition);
    if (stop === undefined || day.areaId === stop.destinationId) continue;
    const mode = legModeSchema.safeParse(day.link?.mode);
    away.set(day.dayId, {
      link:
        day.link === null || !mode.success ? null : { minutes: day.link.minutes, mode: mode.data },
    });
  }
  return away;
}

interface StopRow {
  readonly version_id: string;
  readonly day_id: string;
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
}

/** `onlyVersionId` narrows the read to one live version (the plan check asks about its own). */
export async function loadTripLegsInput(
  tx: pg.PoolClient,
  tripId: string,
  onlyVersionId: string | null = null,
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
        AND ($3::uuid IS NULL OR id = $3)
      ORDER BY created_at, id`,
    [tripId, LIVE_VERSION_STATUSES, onlyVersionId],
  );
  const versionIds = versions.map((version) => version.id);
  const { rows: days } = await tx.query<DayRow>(
    `SELECT id, version_id, to_char(date, 'YYYY-MM-DD') AS date, destination_id FROM plan_days
      WHERE version_id = ANY($1::uuid[]) ORDER BY version_id, day_no`,
    [versionIds],
  );
  const { rows: stops } = await tx.query<StopRow>(
    `SELECT i.version_id, i.day_id, i.stable_id::text AS key,
            coalesce(p.lat, (i.custom_place ->> 'lat')::float8) AS lat,
            coalesce(p.lng, (i.custom_place ->> 'lng')::float8) AS lng
       FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.version_id = ANY($1::uuid[]) AND i.status IS DISTINCT FROM 'cancelled'
        AND coalesce(i.category, p.category) IS DISTINCT FROM 'stay'
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
    const own = days.filter((row) => row.version_id === versionId);
    // Only a version with a day given an area can hold a day trip.
    const away = own.some((day) => day.destination_id !== null)
      ? await awayDays(tx, tripId, versionId)
      : new Map<string, NonNullable<PlannedDay['away']>>();
    for (const day of own) {
      const trip = away.get(day.id);
      planned.push({
        dayId: day.id,
        stay: await stayOn(versionId, day.date),
        stops: stopsByDay.get(day.id) ?? [],
        ...(trip === undefined ? {} : { away: trip }),
      });
    }
    result.push({ versionId, days: planned });
  }
  const { rows: shaped } = await tx.query<{
    from_key: string;
    to_key: string;
    mode: string;
    meters: number;
    shape: string;
  }>(
    `SELECT from_key, to_key, mode, meters, shape FROM plan_legs
      WHERE trip_id = $1 AND shape IS NOT NULL`,
    [tripId],
  );
  const storedShapes = new Map(
    shaped.map((row) => [
      storedShapeKey({
        fromKey: row.from_key,
        toKey: row.to_key,
        mode: row.mode,
        meters: row.meters,
      }),
      row.shape,
    ]),
  );
  return { tripId, driveFactor: trip.drive_factor ?? 1, versions: result, storedShapes };
}
