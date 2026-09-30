/**
 * The upcoming items on a trip's current plan, as the leave-by engine needs them: when and where,
 * who they are for, where the crew sets off from (the last placed stop in the 18 hours before) and
 * the pickup when a linked booking collects the crew before the item starts.
 */
import type pg from 'pg';

/** How far ahead leave-bys are kept. */
const HORIZON = '14 days';

export interface PlanItemRow {
  readonly id: string;
  readonly stable_id: string;
  readonly starts_at: Date;
  readonly tz: string;
  readonly category: string | null;
  readonly title: string;
  readonly place_name: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly origin: { readonly lat: number; readonly lng: number } | null;
  readonly pickup_at: Date | null;
  readonly pickup_place: string | null;
  readonly booking_id: string | null;
  readonly participant_ids: string[];
}

export async function loadPlanItems(
  tx: pg.PoolClient,
  tripId: string,
  now: Date,
): Promise<PlanItemRow[]> {
  const { rows } = await tx.query<PlanItemRow>(
    `WITH trip AS (
       SELECT t.id, t.current_version_id, coalesce(t.tz, d.tz, 'UTC') AS tz
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1 AND t.status NOT IN ('cancelled', 'archived', 'post_trip')
     ),
     items AS (
       SELECT i.id, i.stable_id, i.starts_at, coalesce(i.tz, trip.tz) AS tz, i.category, i.notes,
              i.attendee_ids, i.booking_id, p.name AS place_name, p.lat, p.lng
         FROM plan_items i
         JOIN trip ON i.version_id = trip.current_version_id
         LEFT JOIN pois p ON p.id = i.poi_id
        WHERE i.starts_at IS NOT NULL
     ),
     going AS (
       SELECT array_agg(user_id ORDER BY user_id) AS ids FROM trip_participants
        WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')
     )
     SELECT it.id, it.stable_id, it.starts_at, it.tz, it.category,
            left(coalesce(it.place_name, it.notes, initcap(it.category), ''), 120) AS title,
            it.place_name, it.lat, it.lng,
            (SELECT json_build_object('lat', o.lat, 'lng', o.lng) FROM items o
              WHERE o.lat IS NOT NULL AND o.id <> it.id AND o.starts_at < it.starts_at
                AND o.starts_at > it.starts_at - interval '18 hours'
              ORDER BY o.starts_at DESC LIMIT 1) AS origin,
            b.starts_at AS pickup_at, b.location AS pickup_place, b.id AS booking_id,
            CASE WHEN cardinality(it.attendee_ids) > 0 THEN it.attendee_ids
                 ELSE coalesce((SELECT ids FROM going), '{}') END AS participant_ids
       FROM items it
       LEFT JOIN bookings b ON b.id = it.booking_id AND b.deleted_at IS NULL
        AND b.type IN ('transfer', 'activity', 'boat') AND b.starts_at < it.starts_at
      WHERE it.starts_at > $2 AND it.starts_at < $2 + $3::interval
      ORDER BY it.starts_at, it.id`,
    [tripId, now, HORIZON],
  );
  return rows;
}
