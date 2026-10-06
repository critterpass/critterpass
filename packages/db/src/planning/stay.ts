/**
 * Where the crew sleeps on a night of the trip: the anchor for "from the villa" times, the first
 * and last leg of a planned day, and fit's distance from home. In order:
 *
 * 1. a booked crew stay covering that night, placed on a curated place: the place its plan item
 *    points at, else a stay place of one of the trip's areas (its destination, a stop, a day's
 *    area) whose name is the booking's title or location;
 * 2. a stay in the current plan (an item on a stay place that is itself the stay, or has no kind
 *    of its own; a visit to a villa the catalogue files as a stay is a stop): the latest one on or
 *    before that day, else the first one after it;
 * 3. any booked crew stay with a place, earliest first.
 *
 * `null` means the trip has no anchor yet (callers say "from the centre" or leave the leg out).
 * Personal bookings never anchor crew legs, and a caller under `app_user` only sees what RLS shows.
 */
import type pg from 'pg';

export interface TripStay {
  readonly lat: number;
  readonly lng: number;
  readonly poiId: string;
  readonly name: string;
  readonly source: 'booking' | 'plan';
}

interface StayRow {
  readonly poi_id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

interface BookedStayRow extends StayRow {
  readonly covers: boolean;
}

interface PlannedStayRow extends StayRow {
  readonly date: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const toStay = (row: StayRow, source: TripStay['source']): TripStay => ({
  lat: row.lat,
  lng: row.lng,
  poiId: row.poi_id,
  name: row.name,
  source,
});

/** Crew stay bookings with a place, earliest first, each flagged when it covers `date`'s night. */
async function bookedStays(
  tx: pg.PoolClient,
  tripId: string,
  date: string | null,
  versionId: string | null,
): Promise<BookedStayRow[]> {
  const { rows } = await tx.query<BookedStayRow>(
    `WITH trip AS (
       SELECT coalesce($3::uuid, t.current_version_id) AS version_id, t.destination_id,
              coalesce(t.tz, d.tz, 'UTC') AS tz
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1
     )
     SELECT place.id AS poi_id, place.name, place.lat, place.lng,
            coalesce($2::date >= (b.starts_at AT TIME ZONE coalesce(b.tz, trip.tz))::date
                     AND (b.ends_at IS NULL
                          OR $2::date < (b.ends_at AT TIME ZONE coalesce(b.tz, trip.tz))::date),
                     false) AS covers
       FROM bookings b
       CROSS JOIN trip
       JOIN LATERAL (
         SELECT candidate.id, candidate.name, candidate.lat, candidate.lng
           FROM (
             SELECT 0 AS rank, p.id, p.name, p.lat, p.lng
               FROM plan_items i JOIN pois p ON p.id = i.poi_id
              WHERE i.version_id = trip.version_id AND i.booking_id = b.id
             UNION ALL
             SELECT 1, p.id, p.name, p.lat, p.lng
               FROM pois p
              WHERE p.destination_id IN (SELECT app.trip_area_ids($1, true))
                AND p.category = 'stay'
                AND p.status = 'active'
                AND lower(p.name) IN (lower(b.title), lower(coalesce(b.location, '')))
           ) candidate
          ORDER BY candidate.rank, candidate.id
          LIMIT 1
       ) place ON true
      WHERE b.trip_id = $1 AND b.type = 'stay' AND b.status = 'booked'
        AND b.deleted_at IS NULL AND b.visibility = 'crew' AND b.starts_at IS NOT NULL
      ORDER BY b.starts_at, b.id`,
    [tripId, date, versionId],
  );
  return rows;
}

/** Stay places in the current plan, in day order. */
async function plannedStays(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string | null,
): Promise<PlannedStayRow[]> {
  const { rows } = await tx.query<PlannedStayRow>(
    `SELECT p.id AS poi_id, p.name, p.lat, p.lng, to_char(d.date, 'YYYY-MM-DD') AS date
       FROM trips t
       JOIN plan_items i ON i.version_id = coalesce($2::uuid, t.current_version_id)
       JOIN plan_days d ON d.id = i.day_id
       JOIN pois p ON p.id = i.poi_id
      WHERE t.id = $1 AND p.category = 'stay' AND coalesce(i.category, 'stay') = 'stay'
        AND i.status IS DISTINCT FROM 'cancelled'
      ORDER BY d.day_no, i.starts_at NULLS LAST, i.stable_id`,
    [tripId, versionId],
  );
  return rows;
}

function plannedFor(
  rows: readonly PlannedStayRow[],
  date: string | null,
): PlannedStayRow | undefined {
  if (date === null) return rows[0];
  const before = rows.filter((row) => row.date !== null && row.date <= date);
  return before.at(-1) ?? rows.find((row) => row.date === null || row.date > date);
}

/**
 * The trip's stay for the night of `date` (`YYYY-MM-DD`, the trip's local day); without a date,
 * the first stay of the trip. Plan stays come from `versionId` (a draft or proposal being read),
 * else the current plan.
 */
export async function tripStay(
  tx: pg.PoolClient,
  tripId: string,
  date?: string,
  versionId?: string,
): Promise<TripStay | null> {
  if (date !== undefined && !DATE.test(date)) throw new Error(`tripStay: bad date ${date}`);
  const night = date ?? null;
  const version = versionId ?? null;
  const booked = await bookedStays(tx, tripId, night, version);
  const covering = night === null ? booked[0] : booked.find((row) => row.covers);
  if (covering !== undefined) return toStay(covering, 'booking');
  const planned = plannedFor(await plannedStays(tx, tripId, version), night);
  if (planned !== undefined) return toStay(planned, 'plan');
  const anyBooked = booked[0];
  return anyBooked === undefined ? null : toStay(anyBooked, 'booking');
}

/** The trip's local calendar day at `at`, for asking about tonight's stay. */
export async function tripLocalDate(tx: pg.PoolClient, tripId: string, at: Date): Promise<string> {
  const { rows } = await tx.query<{ date: string }>(
    `SELECT to_char(($2::timestamptz AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date, 'YYYY-MM-DD')
              AS date
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId, at.toISOString()],
  );
  return rows[0]?.date ?? at.toISOString().slice(0, 10);
}
