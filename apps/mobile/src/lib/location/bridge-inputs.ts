/**
 * The synced rows the engine reads (local SQLite through the route layer's watcher) and how they
 * become engine inputs: the user's current trip, their home country, their open share, and the
 * day's plan POIs and stay for the geofence planner and the visit detector.
 */
import {
  poiCategorySchema,
  toCountryCode,
  toLocalWallTime,
  type GeofenceSourceContext,
  type PlanPoi,
  type PoiCategory,
  type TripModeTrip,
  type TripStatus,
} from '@cp/domain';

import type { ActiveShare } from './share-publisher';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Ids are inlined into the watched SQL (the watcher takes no parameters): UUIDs only. */
function uuid(value: string): string {
  if (!UUID.test(value)) throw new Error(`not a uuid: ${value}`);
  return value;
}

export interface TripRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  /** As stored: the place's ISO code, or the destination row's country name. */
  readonly destination_country: string | null;
}

export const TRIP_TABLES = ['trips', 'trip_participants', 'destinations', 'critter_sets'] as const;

/**
 * The trip the engine follows: in_trip first, else the next pre_trip, the user seated on it. The
 * destination's country is its place's ISO code (`critter_sets.country`); `destinations.country`
 * holds the place's name and is only the fallback for a destination with no place yet.
 */
export function tripSql(uid: string): string {
  return `SELECT t.id, t.status, t.start_date, t.end_date, t.tz,
      COALESCE(s.country, d.country) AS destination_country
    FROM trips t
    JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = '${uuid(uid)}'
    LEFT JOIN destinations d ON d.id = t.destination_id
    LEFT JOIN critter_sets s ON s.id = d.critter_set_id
    WHERE t.status IN ('pre_trip', 'in_trip') AND (p.rsvp <> 'out' OR p.role = 'organiser')
    ORDER BY CASE t.status WHEN 'in_trip' THEN 0 ELSE 1 END, t.start_date
    LIMIT 1`;
}

export function toTripModeTrip(row: TripRow | undefined): TripModeTrip | null {
  if (row === undefined) return null;
  return {
    status: row.status as TripStatus,
    startDate: row.start_date,
    endDate: row.end_date,
    tz: row.tz,
    destinationCountry: toCountryCode(row.destination_country),
  };
}

export const HOME_TABLES = ['users'] as const;

export function homeSql(uid: string): string {
  return `SELECT home_country FROM users WHERE id = '${uuid(uid)}'`;
}

export interface ShareRow {
  readonly id: string;
  readonly reason: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly paused: number | boolean;
}

export const SHARE_TABLES = ['location_shares'] as const;

export function shareSql(uid: string): string {
  return `SELECT id, reason, starts_at, ends_at, paused FROM location_shares WHERE user_id = '${uuid(uid)}'`;
}

const SHARE_ORDER: Readonly<Record<ActiveShare['reason'], number>> = {
  sos: 0,
  help: 1,
  crew_map: 2,
};

/** The open share that matters most right now (SOS over Help over the crew map). */
export function activeShare(rows: readonly ShareRow[], now: number): ActiveShare | null {
  const open = rows
    .filter((row): row is ShareRow & { reason: ActiveShare['reason'] } => row.reason in SHARE_ORDER)
    .filter((row) => Date.parse(row.starts_at) <= now)
    .filter((row) => row.ends_at === null || Date.parse(row.ends_at) > now)
    .filter((row) => !row.paused || row.reason !== 'crew_map')
    .sort((a, b) => SHARE_ORDER[a.reason] - SHARE_ORDER[b.reason]);
  const first = open[0];
  return first === undefined ? null : { id: first.id, reason: first.reason };
}

export interface PlanPoiRow {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly radius: number | null;
  readonly category: string;
  readonly starts_at: string | null;
}

export const PLAN_POI_TABLES = ['plan_items', 'pois', 'trips'] as const;

export function planPoiSql(tripId: string): string {
  return `SELECT p.id, p.lat, p.lng, p.visit_radius_m AS radius, p.category, pi.starts_at
    FROM plan_items pi
    JOIN trips t ON t.id = pi.trip_id AND pi.version_id = t.current_version_id
    JOIN pois p ON p.id = pi.poi_id
    WHERE pi.trip_id = '${uuid(tripId)}' AND pi.status <> 'removed'`;
}

/** A plan POI the visit detector can recognise (category decides its dwell and radius). */
export interface VisitCandidate extends PlanPoi {
  readonly category: PoiCategory;
}

export interface DayPlan {
  readonly context: GeofenceSourceContext;
  readonly candidates: readonly VisitCandidate[];
}

/**
 * Today's plan POIs in the trip's zone (every planned POI when none is dated), and the stay: the
 * latest dated stay on or before today, else the first one.
 */
export function dayPlan(
  tripId: string,
  rows: readonly PlanPoiRow[],
  now: number,
  tz: string,
): DayPlan {
  const today = toLocalWallTime(new Date(now), tz).date;
  const dateOf = (row: PlanPoiRow) =>
    row.starts_at === null ? null : toLocalWallTime(new Date(row.starts_at), tz).date;
  const toCandidate = (row: PlanPoiRow): VisitCandidate => ({
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius,
    category: poiCategorySchema.catch('other').parse(row.category),
  });
  const stays = rows.filter((row) => row.category === 'stay');
  const others = rows.filter((row) => row.category !== 'stay');
  const dated = others.some((row) => dateOf(row) !== null);
  const todays = dated ? others.filter((row) => dateOf(row) === today) : others;
  const pastStays = stays.filter((row) => (dateOf(row) ?? today) <= today);
  const stay = pastStays.at(-1) ?? stays[0];
  const seen = new Set<string>();
  const candidates = [...todays, ...(stay ? [stay] : [])]
    .filter((row) => !seen.has(row.id) && Boolean(seen.add(row.id)))
    .map(toCandidate);
  const planSeen = new Set<string>();
  return {
    context: {
      tripId,
      planPois: todays
        .filter((row) => !planSeen.has(row.id) && Boolean(planSeen.add(row.id)))
        .map(toCandidate),
      stay: stay ? toCandidate(stay) : null,
    },
    candidates,
  };
}
