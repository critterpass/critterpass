/**
 * A wallet booking's place on the plan: the anchored items a plan version should hold for the
 * trip's bookings, shared by the api (booking commands, publishing a proposal's plan) and the
 * worker (saving a draft). A flight gives one item per leg (departure to arrival), a stay its
 * check-in, a transfer, activity, boat or rail booking its start; each sits on the plan day of its
 * local date, so a booking outside the trip's days gives none. Only what the crew may already see
 * in the wallet reaches the plan, because plan items are read by the whole trip: a crew booking
 * under its title, and a personal flight the owner left visible under its leg's number and route.
 * A booking bought through a supplier order is left out: the order already points at its plan item.
 * Each item keeps one `stable_id` per booking and leg across versions, so adding the same booking
 * twice changes nothing. Runs in the caller's transaction, as a role that may write plan rows.
 */
import type pg from 'pg';

/** The check-in of a stay is a moment on its day, not the nights that follow. */
const STAY_CHECK_IN_MINUTES = 30;
/** A booking without an end still takes time on the day. */
const DEFAULT_MINUTES = 60;

export interface BookedPlanItem {
  readonly stable_id: string;
  readonly day_no: number;
  readonly booking_id: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly tz: string;
  readonly attendee_ids: string[];
  readonly category: string;
  readonly notes: string;
}

interface Row extends Omit<BookedPlanItem, 'starts_at' | 'ends_at'> {
  readonly starts_at: Date;
  readonly ends_at: Date;
}

const LIVE = `b.deleted_at IS NULL AND b.status <> 'cancelled' AND b.supplier_order_id IS NULL`;

/** The booked items `versionId` should hold, in time order. */
export async function bookedPlanItems(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
): Promise<BookedPlanItem[]> {
  const { rows } = await tx.query<Row>(
    `WITH trip AS (
       SELECT coalesce(t.tz, d.tz, 'UTC') AS tz
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1
     ),
     moments AS (
       SELECT b.id AS booking_id, s.segment_no AS part, 'flight' AS category,
              s.sched_dep_at AS starts_at, s.sched_arr_at AS ends_at, $4::int AS fallback_min,
              s.carrier || ' ' || s.flight_no || ' · ' || s.dep_airport || ' → ' || s.arr_airport
                AS label,
              b.tz, b.traveller_ids
         FROM bookings b JOIN flight_segments s ON s.booking_id = b.id
        WHERE b.trip_id = $1 AND b.type = 'flight' AND ${LIVE}
          AND (b.visibility = 'crew' OR b.flight_crew_visible)
       UNION ALL
       SELECT b.id, 0,
              CASE b.type WHEN 'stay' THEN 'stay' WHEN 'transfer' THEN 'transfer'
                          WHEN 'rail' THEN 'train' ELSE 'activity' END,
              b.starts_at, CASE WHEN b.type = 'stay' THEN NULL ELSE b.ends_at END,
              CASE WHEN b.type = 'stay' THEN $3::int ELSE $4::int END,
              b.title, b.tz, b.traveller_ids
         FROM bookings b
        WHERE b.trip_id = $1 AND b.type IN ('stay', 'transfer', 'activity', 'boat', 'rail')
          AND ${LIVE} AND b.visibility = 'crew' AND b.starts_at IS NOT NULL
     )
     SELECT overlay(overlay(md5(m.booking_id::text || ':' || m.part::text) placing '8' from 13)
                    placing '8' from 17)::uuid AS stable_id,
            d.day_no, m.booking_id, m.starts_at,
            CASE WHEN m.ends_at > m.starts_at THEN m.ends_at
                 ELSE m.starts_at + make_interval(mins => m.fallback_min) END AS ends_at,
            coalesce(m.tz, trip.tz) AS tz, m.traveller_ids AS attendee_ids, m.category,
            left(m.label, 200) AS notes
       FROM moments m CROSS JOIN trip
       JOIN plan_days d ON d.version_id = $2
        AND d.date = (m.starts_at AT TIME ZONE coalesce(m.tz, trip.tz))::date
      ORDER BY m.starts_at, m.booking_id, m.part`,
    [tripId, versionId, STAY_CHECK_IN_MINUTES, DEFAULT_MINUTES],
  );
  return rows.map((row) => ({
    ...row,
    starts_at: row.starts_at.toISOString(),
    ends_at: row.ends_at.toISOString(),
  }));
}

/** Whether a plan item is one this module placed for a booking (and so may move or remove). */
export function isBookedPlanItem(item: {
  readonly booking_id?: string | null | undefined;
  readonly locked_reason?: string | null | undefined;
}): boolean {
  return typeof item.booking_id === 'string' && item.locked_reason === 'booking';
}

const RECORD = `jsonb_to_recordset($2::jsonb) AS r(stable_id uuid, day_no int, booking_id uuid,
  starts_at timestamptz, ends_at timestamptz, tz text, attendee_ids uuid[], category text, notes text)`;

/**
 * Brings the booked items of a version nobody builds on yet (an organiser's draft, or the version
 * a proposal is about to publish) in line with the trip's bookings, in place; resolves to the rows
 * it changed. A trip's current version changes only through a new plan version, never through this.
 */
export async function writeBookedPlanItems(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
): Promise<number> {
  const wanted = await bookedPlanItems(tx, tripId, versionId);
  const json = JSON.stringify(wanted);
  const removed = await tx.query(
    `DELETE FROM plan_items
      WHERE version_id = $1 AND booking_id IS NOT NULL AND locked_reason = 'booking'
        AND NOT (stable_id = ANY ($2::uuid[]))`,
    [versionId, wanted.map((item) => item.stable_id)],
  );
  const moved = await tx.query(
    `UPDATE plan_items i
        SET day_id = d.id, booking_id = r.booking_id, starts_at = r.starts_at, ends_at = r.ends_at,
            tz = r.tz, attendee_ids = r.attendee_ids, category = r.category, notes = r.notes,
            locked_reason = 'booking', status = 'confirmed'
       FROM ${RECORD} JOIN plan_days d ON d.version_id = $1 AND d.day_no = r.day_no
      WHERE i.version_id = $1 AND i.stable_id = r.stable_id
        AND (i.day_id, i.booking_id, i.starts_at, i.ends_at, i.tz, i.attendee_ids, i.category,
             i.notes, i.locked_reason, i.status)
            IS DISTINCT FROM
            (d.id, r.booking_id, r.starts_at, r.ends_at, r.tz, r.attendee_ids, r.category,
             r.notes, 'booking'::text, 'confirmed'::text)`,
    [versionId, json],
  );
  const added = await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       attendee_ids, booking_id, category, status, created_by_kind, notes, locked_reason)
     SELECT $1, d.id, $3, r.stable_id, r.starts_at, r.ends_at, r.tz, r.attendee_ids, r.booking_id,
            r.category, 'confirmed', 'user', r.notes, 'booking'
       FROM ${RECORD} JOIN plan_days d ON d.version_id = $1 AND d.day_no = r.day_no
      WHERE NOT EXISTS (
        SELECT 1 FROM plan_items i WHERE i.version_id = $1 AND i.stable_id = r.stable_id)`,
    [versionId, json, tripId],
  );
  return (removed.rowCount ?? 0) + (moved.rowCount ?? 0) + (added.rowCount ?? 0);
}
