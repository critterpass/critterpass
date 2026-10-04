/**
 * Plan and place reads for the explore routes and the swipe match: the trip as its member sees
 * it, the trip's current plan as slot-finder days (timed items in local minutes), the stay's
 * position, where a place already sits in the plan, who in the crew saved it and the crew's Q&A
 * line. Read as the caller: RLS shows a member the crew-visible version only.
 */
import { recommendedOrderSql, recommendedSql, sendInTx } from '@cp/db';
import { DomainError, EXPLORE_QUEUES, toLocalWallTime } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import type { SlotDay } from './slot-suggest';

export interface TripFacts {
  readonly id: string;
  readonly tz: string | null;
  readonly destination_id: string | null;
  readonly current_version_id: string | null;
  readonly start_date: string | null;
  readonly organiser: boolean;
}

export interface PlaceFacts {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: unknown;
  readonly tz: string | null;
  readonly timeNeededMin: number | null;
  readonly category: string;
  readonly tags: readonly string[];
  readonly editorial: Readonly<Record<string, unknown>>;
}

export async function placeFacts(tx: pg.PoolClient, poiId: string): Promise<PlaceFacts> {
  const { rows } = await tx.query<PlaceFacts>(
    `SELECT p.name, p.lat, p.lng, p.hours, coalesce(p.timezone, d.tz) AS tz,
            (p.editorial->>'time_needed_min')::int AS "timeNeededMin", p.category, p.tags,
            p.editorial
       FROM pois p JOIN destinations d ON d.id = p.destination_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [poiId],
  );
  const place = rows[0];
  if (place === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi' });
  return place;
}

export interface PlanSlots {
  readonly days: SlotDay[];
  readonly firstDate: string | null;
  readonly stay: { readonly lat: number; readonly lng: number } | null;
  readonly inPlan: {
    readonly day_no: number;
    readonly stable_id: string;
    readonly starts_at: string | null;
  } | null;
}

const localMinutes = (at: Date, tz: string): number => {
  const [h, m] = toLocalWallTime(at, tz).time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export async function loadSlotDays(
  tx: pg.PoolClient,
  trip: Pick<TripFacts, 'current_version_id'>,
  poiId: string,
  tz: string,
): Promise<PlanSlots> {
  if (trip.current_version_id === null)
    return { days: [], firstDate: null, stay: null, inPlan: null };
  const { rows: days } = await tx.query<{ day_no: number; date: string | null }>(
    `SELECT day_no, to_char(date, 'YYYY-MM-DD') AS date FROM plan_days
      WHERE version_id = $1 ORDER BY day_no`,
    [trip.current_version_id],
  );
  const { rows: items } = await tx.query<{
    day_no: number;
    stable_id: string;
    poi_id: string | null;
    starts_at: Date | null;
    ends_at: Date | null;
    category: string | null;
    lat: number | null;
    lng: number | null;
  }>(
    `SELECT d.day_no, i.stable_id, i.poi_id, i.starts_at, i.ends_at, p.category, p.lat, p.lng
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.version_id = $1 AND i.status IS DISTINCT FROM 'cancelled'
      ORDER BY d.day_no, i.starts_at NULLS LAST, i.stable_id`,
    [trip.current_version_id],
  );
  const stayRow = items.find((item) => item.category === 'stay' && item.lat !== null);
  const here = items.find((item) => item.poi_id === poiId);
  return {
    days: days.map((day) => ({
      day_no: day.day_no,
      date: day.date,
      busy: items
        .filter((item) => item.day_no === day.day_no && item.category !== 'stay')
        .flatMap((item) =>
          item.starts_at === null || item.ends_at === null
            ? []
            : [{ start: localMinutes(item.starts_at, tz), end: localMinutes(item.ends_at, tz) }],
        ),
    })),
    firstDate: days.find((day) => day.date !== null)?.date ?? null,
    stay: stayRow === undefined ? null : { lat: stayRow.lat ?? 0, lng: stayRow.lng ?? 0 },
    inPlan:
      here === undefined
        ? null
        : {
            day_no: here.day_no,
            stable_id: here.stable_id,
            starts_at: here.starts_at?.toISOString() ?? null,
          },
  };
}

export async function tripFacts(tx: pg.PoolClient, tripId: string): Promise<TripFacts> {
  const { rows } = await tx.query<TripFacts>(
    `SELECT t.id, coalesce(t.tz, d.tz) AS tz, t.destination_id, t.current_version_id,
            t.start_date::text AS start_date, app.is_trip_organiser(t.id) AS organiser
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND app.is_trip_member(t.id)`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip;
}

/** Crewmates on the trip who saved this place: derived, only for a place in the trip's destination. */
export async function savedBy(
  tx: pg.PoolClient,
  trip: TripFacts,
  poiId: string,
): Promise<string[]> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ user_id: string }>(
      `SELECT s.user_id FROM saved_items s
         JOIN trip_participants p ON p.user_id = s.user_id AND p.trip_id = $1
         JOIN pois ON pois.id = s.ref_id AND pois.destination_id = $3
        WHERE s.kind = 'poi' AND s.ref_id = $2 AND p.rsvp IS DISTINCT FROM 'out'
        ORDER BY s.created_at, s.user_id`,
      [trip.id, poiId, trip.destination_id],
    ),
  );
  return rows.map((row) => row.user_id);
}

/** The trip's Q&A line, and a refresh queued when its chat named the place since. */
export async function qnaLine(tx: pg.PoolClient, tripId: string, poiId: string, name: string) {
  const { rows } = await tx.query<{ text: string; source_at: Date; updated_at: Date }>(
    'SELECT text, source_at, updated_at FROM place_qna_summaries WHERE trip_id = $1 AND poi_id = $2',
    [tripId, poiId],
  );
  const line = rows[0];
  const latest = await tx.query<{ at: Date | null }>(
    `SELECT max(created_at) AS at FROM messages
      WHERE trip_id = $1 AND sender_kind = 'user' AND type = 'text' AND deleted_at IS NULL
        AND ((ref_kind = 'poi' AND ref_id = $2) OR strpos(lower(body), lower($3)) > 0)`,
    [tripId, poiId, name],
  );
  const at = latest.rows[0]?.at ?? null;
  if (at !== null && (line === undefined || at > line.source_at)) {
    await sendInTx(
      tx,
      EXPLORE_QUEUES.placeQna,
      { trip_id: tripId, poi_id: poiId },
      {
        singletonKey: `${tripId}:${poiId}`,
      },
    );
  }
  return line === undefined
    ? null
    : {
        text: line.text,
        source_at: line.source_at.toISOString(),
        updated_at: line.updated_at.toISOString(),
      };
}

export interface SimilarPlace {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  readonly minutes: number;
}

/**
 * Curated places of the same kind elsewhere in the destination, most shared tags first; the
 * caller keeps only those far enough away to be "the same idea somewhere else". Places the caller
 * hid are left out.
 */
export async function similarPlaces(
  tx: pg.PoolClient,
  input: {
    readonly destinationId: string | null;
    readonly poiId: string;
    readonly place: Pick<PlaceFacts, 'category' | 'tags'>;
  },
): Promise<{ poi_id: string; name: string; category: string; lat: number; lng: number }[]> {
  if (input.destinationId === null) return [];
  const { rows } = await tx.query<{
    poi_id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
  }>(
    `SELECT p.id AS poi_id, p.name, p.category, p.lat, p.lng FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND ${recommendedSql('p')}
        AND p.merged_into_id IS NULL AND p.id <> $2 AND p.category = $3
        AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = p.id AND h.user_id = app.uid())
      ORDER BY cardinality(ARRAY(SELECT unnest(p.tags) INTERSECT SELECT unnest($4::text[]))) DESC,
               ${recommendedOrderSql('p')}, p.name
      LIMIT 20`,
    [input.destinationId, input.poiId, input.place.category, [...input.place.tags]],
  );
  return rows;
}
