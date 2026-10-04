/**
 * The place a GO opens on, read from the phone's synced rows: a place by id, the stop a leave-by
 * is for, or the trip's next leave-by (what its push is about). Also the trip's destination, for
 * the region tiles and the drive factor the api applies.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route params, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export type GoTarget =
  | { readonly kind: 'place'; readonly poiId: string; readonly tripId: string | null }
  | { readonly kind: 'leave_by'; readonly leaveById: string }
  | { readonly kind: 'next_leave_by'; readonly tripId: string };

export interface GoPlace {
  readonly poiId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly tripId: string | null;
  readonly destinationSlug: string | null;
}

/** A leave-by that went off this long ago still counts as the one its push was about. */
const NEXT_LEAVE_BY_GRACE_MS = 2 * 60 * 60_000;

const PLACE_COLUMNS = 'p.id AS poi_id, p.name, p.lat, p.lng';
const PLACE_SQL = `SELECT ${PLACE_COLUMNS} FROM pois p WHERE p.id = ? AND p.lat IS NOT NULL`;
const LEAVE_BY_PLACE_SQL = `SELECT ${PLACE_COLUMNS}, l.trip_id FROM leave_bys l
  JOIN plan_items i ON i.id = l.plan_item_id
  JOIN pois p ON p.id = i.poi_id
  WHERE l.id = ? AND p.lat IS NOT NULL`;
const NEXT_LEAVE_BY_PLACE_SQL = `SELECT ${PLACE_COLUMNS}, l.trip_id FROM leave_bys l
  JOIN plan_items i ON i.id = l.plan_item_id
  JOIN pois p ON p.id = i.poi_id
  WHERE l.trip_id = ? AND l.state NOT IN ('cancelled', 'departed')
    AND julianday(l.leave_at) > julianday(?) AND p.lat IS NOT NULL
  ORDER BY l.leave_at LIMIT 1`;
const DESTINATION_SQL = `SELECT d.slug FROM trips t JOIN destinations d ON d.id = t.destination_id
  WHERE t.id = ?`;

interface PlaceRow {
  readonly poi_id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly trip_id?: string | null;
}

/** Route params → target; null when they name nothing GO can open. */
export function targetFromParams(params: {
  readonly poi?: string | undefined;
  readonly trip?: string | undefined;
  readonly leaveBy?: string | undefined;
}): GoTarget | null {
  if (params.leaveBy === 'next') {
    return params.trip ? { kind: 'next_leave_by', tripId: params.trip } : null;
  }
  if (params.leaveBy) return { kind: 'leave_by', leaveById: params.leaveBy };
  if (params.poi) return { kind: 'place', poiId: params.poi, tripId: params.trip ?? null };
  return null;
}

export function paramsForTarget(target: GoTarget): Record<string, string> {
  if (target.kind === 'next_leave_by') return { trip: target.tripId, leaveBy: 'next' };
  if (target.kind === 'leave_by') return { leaveBy: target.leaveById };
  return target.tripId === null
    ? { poi: target.poiId }
    : { poi: target.poiId, trip: target.tripId };
}

export async function loadGoPlace(
  db: Pick<AbstractPowerSyncDatabase, 'getAll'>,
  target: GoTarget,
  now: Date,
): Promise<GoPlace | null> {
  const rows =
    target.kind === 'place'
      ? await db.getAll<PlaceRow>(PLACE_SQL, [target.poiId])
      : target.kind === 'leave_by'
        ? await db.getAll<PlaceRow>(LEAVE_BY_PLACE_SQL, [target.leaveById])
        : await db.getAll<PlaceRow>(NEXT_LEAVE_BY_PLACE_SQL, [
            target.tripId,
            new Date(now.getTime() - NEXT_LEAVE_BY_GRACE_MS).toISOString(),
          ]);
  const row = rows[0];
  if (row === undefined) return null;
  const tripId = target.kind === 'place' ? target.tripId : (row.trip_id ?? null);
  const destination =
    tripId === null ? [] : await db.getAll<{ slug: string | null }>(DESTINATION_SQL, [tripId]);
  return {
    poiId: row.poi_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    tripId,
    destinationSlug: destination[0]?.slug ?? null,
  };
}
