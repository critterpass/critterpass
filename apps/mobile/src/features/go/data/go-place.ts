/**
 * The place a GO opens on, read from the phone's synced rows (a place the phone does not hold is
 * read from the api, or its last good copy, through `remote`): a place by id, the stop a leave-by
 * is for, or the trip's next leave-by (what its push is about). A flight's leave-by has no place
 * of its own: it goes to the departure airport of the flight leg it is for (the leg the leave-by
 * recompute and its push name), placed from the bundled airport list. Also the region tiles'
 * destination and the trip whose drive factor the api applies. Null when nothing can be placed:
 * the caller then opens what it would have without GO, never an empty GO.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route params, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export type GoTarget =
  | { readonly kind: 'place'; readonly poiId: string; readonly tripId: string | null }
  | { readonly kind: 'leave_by'; readonly leaveById: string }
  | {
      readonly kind: 'next_leave_by';
      readonly tripId: string;
      /** The in-app path opened instead when the leave-by can't be placed (its push's day). */
      readonly fallback: string | null;
    };

export interface GoPlace {
  /** Null for an airport: it has no place row (and no ride quote). */
  readonly poiId: string | null;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly tripId: string | null;
  readonly destinationSlug: string | null;
  /** The place's street address and its destination's name, for the maps app; null for an airport. */
  readonly address?: string | null | undefined;
  readonly city?: string | null | undefined;
  /** Set when the place is an airport: the button names it ("Đà Nẵng airport (DAD)"). */
  readonly airport?: { readonly iata: string; readonly city: string } | undefined;
}

export interface AirportPoint {
  readonly iata: string;
  readonly name: string;
  readonly city: string;
  readonly lat: number;
  readonly lng: number;
}

/** The airport `iata` is, from the bundled airport list; null when unknown. */
export type AirportLookup = (iata: string) => AirportPoint | null;

/** A place the api knows, as GO needs it (`@/data/places/place-read`). */
export interface RemoteGoPlace {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
}

/** Reads a place the phone does not hold; null when it can't be had. */
export type RemoteGoPlaceReader = (poiId: string) => Promise<RemoteGoPlace | null>;

/** A leave-by that went off this long ago still counts as the one its push was about. */
const NEXT_LEAVE_BY_GRACE_MS = 2 * 60 * 60_000;

const PLACE_SQL = `SELECT p.id AS poi_id, p.name, p.lat, p.lng, p.address, d.name AS city, d.slug
  FROM pois p LEFT JOIN destinations d ON d.id = p.destination_id
  WHERE p.id = ? AND p.lat IS NOT NULL`;
/** The leave-by's stop and, for a flight leg, its departure airport (as the push names it). */
const LEAVE_BY_COLUMNS = `l.trip_id, p.id AS poi_id, p.name, p.lat, p.lng, p.address,
  (SELECT d.name FROM destinations d WHERE d.id = p.destination_id) AS city,
  (SELECT s.dep_airport FROM flight_segments s
    WHERE s.booking_id = i.booking_id AND julianday(s.sched_dep_at) = julianday(l.starts_at)
    ORDER BY s.segment_no LIMIT 1) AS dep_airport,
  (SELECT d.slug FROM trips t JOIN destinations d ON d.id = t.destination_id
    WHERE t.id = l.trip_id) AS trip_slug,
  (SELECT d.slug FROM destinations d WHERE d.id = p.destination_id) AS slug
  FROM leave_bys l
  LEFT JOIN plan_items i ON i.id = l.plan_item_id
  LEFT JOIN pois p ON p.id = i.poi_id`;
const LEAVE_BY_SQL = `SELECT ${LEAVE_BY_COLUMNS} WHERE l.id = ?`;
const NEXT_LEAVE_BY_SQL = `SELECT ${LEAVE_BY_COLUMNS}
  WHERE l.trip_id = ? AND l.state NOT IN ('cancelled', 'departed')
    AND julianday(l.leave_at) > julianday(?)
  ORDER BY l.leave_at LIMIT 1`;

interface PlaceRow {
  readonly poi_id: string | null;
  readonly name: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly slug: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly trip_id?: string | null;
  readonly trip_slug?: string | null;
  readonly dep_airport?: string | null;
}

/** Only an in-app path may be a fallback, so a crafted link can't send GO anywhere else. */
const inAppPath = (value: string | undefined): string | null =>
  value !== undefined && value.startsWith('/') && !value.startsWith('//') ? value : null;

/** Route params → target; null when they name nothing GO can open. */
export function targetFromParams(params: {
  readonly poi?: string | undefined;
  readonly trip?: string | undefined;
  readonly leaveBy?: string | undefined;
  readonly fallback?: string | undefined;
}): GoTarget | null {
  if (params.leaveBy === 'next') {
    return params.trip
      ? { kind: 'next_leave_by', tripId: params.trip, fallback: inAppPath(params.fallback) }
      : null;
  }
  if (params.leaveBy) return { kind: 'leave_by', leaveById: params.leaveBy };
  if (params.poi) return { kind: 'place', poiId: params.poi, tripId: params.trip ?? null };
  return null;
}

export function paramsForTarget(target: GoTarget): Record<string, string> {
  if (target.kind === 'next_leave_by') {
    return target.fallback === null
      ? { trip: target.tripId, leaveBy: 'next' }
      : { trip: target.tripId, leaveBy: 'next', fallback: target.fallback };
  }
  if (target.kind === 'leave_by') return { leaveBy: target.leaveById };
  return target.tripId === null
    ? { poi: target.poiId }
    : { poi: target.poiId, trip: target.tripId };
}

function placeOf(row: PlaceRow, tripId: string | null, airportAt: AirportLookup): GoPlace | null {
  if (row.poi_id !== null && row.lat !== null && row.lng !== null) {
    return {
      poiId: row.poi_id,
      name: row.name ?? '',
      lat: row.lat,
      lng: row.lng,
      tripId,
      destinationSlug: row.slug ?? row.trip_slug ?? null,
      address: row.address ?? null,
      city: row.city ?? null,
    };
  }
  const airport = row.dep_airport ? airportAt(row.dep_airport) : null;
  if (airport === null) return null;
  return {
    poiId: null,
    name: airport.name,
    lat: airport.lat,
    lng: airport.lng,
    tripId,
    destinationSlug: row.trip_slug ?? null,
    airport: { iata: airport.iata, city: airport.city },
  };
}

export async function loadGoPlace(
  db: Pick<AbstractPowerSyncDatabase, 'getAll'>,
  target: GoTarget,
  now: Date,
  airportAt: AirportLookup,
  remote?: RemoteGoPlaceReader,
): Promise<GoPlace | null> {
  const rows =
    target.kind === 'place'
      ? await db.getAll<PlaceRow>(PLACE_SQL, [target.poiId])
      : target.kind === 'leave_by'
        ? await db.getAll<PlaceRow>(LEAVE_BY_SQL, [target.leaveById])
        : await db.getAll<PlaceRow>(NEXT_LEAVE_BY_SQL, [
            target.tripId,
            new Date(now.getTime() - NEXT_LEAVE_BY_GRACE_MS).toISOString(),
          ]);
  const row = rows[0];
  if (row === undefined && target.kind === 'place' && remote !== undefined) {
    const place = await remote(target.poiId).catch(() => null);
    return place === null
      ? null
      : {
          poiId: place.id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          tripId: target.tripId,
          destinationSlug: null,
          address: place.address,
          city: null,
        };
  }
  if (row === undefined) return null;
  const tripId = target.kind === 'place' ? target.tripId : (row.trip_id ?? null);
  return placeOf(row, tripId, airportAt);
}
