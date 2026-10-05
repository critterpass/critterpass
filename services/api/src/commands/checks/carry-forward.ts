/**
 * What a new plan version keeps from the one before it, written in the transaction that makes it,
 * so an edit never blanks what was already known:
 *
 * - Travel: a pair of stops that is still next to each other, between the same two places, keeps
 *   its stored leg (minutes, mode, road shape) at once. Only pairs the edit created wait for the
 *   legs job. A leg to or from the night's stay is kept while the day's date and the plan's stays
 *   are the same.
 * - The plan check: what it found on days the edit did not touch moves to the new version under
 *   the same ids; what it found on a day that changed is dropped, since its times and stops are no
 *   longer the plan's. The crew's check is marked as waiting for its next run with the counts of
 *   what was kept, so the list never names a stop that is gone and never grows on a day nobody
 *   touched.
 *
 * Runs as the system. An organiser's private draft keeps its own issues the same way and leaves
 * the trip-wide check row, which members sync, alone.
 */
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

const LIVE = ['draft', 'proposed', 'current'];

/** An item that is a stop: has a place, is not cancelled and is not the stay itself. */
const STOPS = `
  SELECT i.version_id, i.day_id, i.stable_id, i.starts_at,
         coalesce(p.lat, (i.custom_place ->> 'lat')::float8) AS lat,
         coalesce(p.lng, (i.custom_place ->> 'lng')::float8) AS lng
    FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
   WHERE i.trip_id = $1 AND i.status IS DISTINCT FROM 'cancelled'
     AND coalesce(i.category, p.category) IS DISTINCT FROM 'stay'
     AND coalesce(p.lat, (i.custom_place ->> 'lat')::float8) IS NOT NULL
     AND coalesce(p.lng, (i.custom_place ->> 'lng')::float8) IS NOT NULL`;

/** What decides a version's stay each night: its stay items and its booked items, in day order. */
const ANCHORS = `
  SELECT v.id AS version_id,
         coalesce((SELECT jsonb_agg(jsonb_build_array(d.day_no, d.date, i.poi_id, i.booking_id)
                                    ORDER BY d.day_no, i.starts_at NULLS LAST, i.stable_id)
                     FROM plan_items i JOIN plan_days d ON d.id = i.day_id
                     LEFT JOIN pois p ON p.id = i.poi_id
                    WHERE i.version_id = v.id AND i.status IS DISTINCT FROM 'cancelled'
                      AND (i.booking_id IS NOT NULL
                           OR (p.category = 'stay' AND coalesce(i.category, 'stay') = 'stay'))),
                  '[]'::jsonb) AS anchors
    FROM itinerary_versions v WHERE v.trip_id = $1`;

/** Copies the stored legs of unchanged pairs into the trip's live versions that lack them. */
export async function carryLegs(tx: pg.PoolClient, tripId: string): Promise<number> {
  const { rowCount } = await tx.query(
    `WITH stops AS (${STOPS}), anchors AS (${ANCHORS}),
     seq AS (
       SELECT s.version_id, s.day_id, s.stable_id,
              lead(s.stable_id) OVER w AS next_id,
              row_number() OVER w AS n,
              count(*) OVER (PARTITION BY s.version_id, s.day_id) AS total
         FROM stops s JOIN itinerary_versions v ON v.id = s.version_id
        WHERE v.status = ANY($2::text[])
       WINDOW w AS (PARTITION BY s.version_id, s.day_id ORDER BY s.starts_at NULLS LAST, s.stable_id)
     ), wanted AS (
       SELECT version_id, day_id, stable_id::text AS from_key, next_id::text AS to_key
         FROM seq WHERE next_id IS NOT NULL
       UNION ALL
       SELECT version_id, day_id, 'stay', stable_id::text FROM seq WHERE n = 1
       UNION ALL
       SELECT version_id, day_id, stable_id::text, 'stay' FROM seq WHERE n = total
     )
     INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                            source, approx, shape, computed_at)
     SELECT DISTINCT ON (w.version_id, w.from_key, w.to_key)
            $1, w.version_id, w.day_id, w.from_key, w.to_key, l.mode, l.minutes, l.meters,
            l.source, l.approx, l.shape, l.computed_at
       FROM wanted w
       JOIN plan_legs l ON l.trip_id = $1 AND l.version_id <> w.version_id
                       AND l.from_key = w.from_key AND l.to_key = w.to_key
       JOIN plan_days new_day ON new_day.id = w.day_id
       JOIN plan_days old_day ON old_day.id = l.day_id
       LEFT JOIN stops new_from ON new_from.version_id = w.version_id
                               AND new_from.stable_id::text = w.from_key
       LEFT JOIN stops old_from ON old_from.version_id = l.version_id
                               AND old_from.stable_id::text = w.from_key
       LEFT JOIN stops new_to ON new_to.version_id = w.version_id
                             AND new_to.stable_id::text = w.to_key
       LEFT JOIN stops old_to ON old_to.version_id = l.version_id
                             AND old_to.stable_id::text = w.to_key
      WHERE NOT EXISTS (SELECT 1 FROM plan_legs have
                         WHERE have.version_id = w.version_id AND have.from_key = w.from_key
                           AND have.to_key = w.to_key)
        AND (w.from_key = 'stay'
             OR (new_from.lat = old_from.lat AND new_from.lng = old_from.lng))
        AND (w.to_key = 'stay' OR (new_to.lat = old_to.lat AND new_to.lng = old_to.lng))
        AND ((w.from_key <> 'stay' AND w.to_key <> 'stay')
             OR (new_day.date IS NOT DISTINCT FROM old_day.date
                 AND (SELECT a.anchors FROM anchors a WHERE a.version_id = w.version_id)
                   = (SELECT a.anchors FROM anchors a WHERE a.version_id = l.version_id)))
      ORDER BY w.version_id, w.from_key, w.to_key, l.computed_at DESC
     ON CONFLICT (version_id, from_key, to_key) DO NOTHING`,
    [tripId, LIVE],
  );
  return rowCount ?? 0;
}

/** Each day of a version as one value that changes when anything on that day does. */
const DAY_MARKS = `
  SELECT d.version_id, d.id AS day_id, d.day_no,
         md5(coalesce(d.date::text, '') || '|' || coalesce((
           SELECT string_agg(jsonb_build_array(i.stable_id, i.starts_at, i.ends_at, i.poi_id,
                                               i.custom_place, i.status, i.attendee_ids,
                                               i.booking_id, i.locked_reason, i.category)::text,
                             '|' ORDER BY i.stable_id)
             FROM plan_items i WHERE i.day_id = d.id), '')) AS mark
    FROM plan_days d WHERE d.trip_id = $1`;

/**
 * Moves the plan check's issues to the version the check reads now: kept on untouched days,
 * dropped on changed ones. Returns the version, or null when there was nothing to move.
 */
export async function carryCheck(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  const { rows: trips } = await tx.query<{ version_id: string | null; crew: boolean }>(
    `SELECT coalesce(current_version_id, draft_version_id) AS version_id,
            current_version_id IS NOT NULL AS crew
       FROM trips WHERE id = $1`,
    [tripId],
  );
  const trip = trips[0];
  if (trip === undefined || trip.version_id === null) return null;
  const versionId = trip.version_id;
  const { rows: behind } = await tx.query(
    `SELECT 1 FROM plan_check_issues WHERE trip_id = $1 AND version_id <> $2
     UNION ALL
     SELECT 1 FROM plan_checks WHERE trip_id = $1 AND $3::bool AND version_id IS DISTINCT FROM $2
     LIMIT 1`,
    [tripId, versionId, trip.crew],
  );
  if (behind.length === 0) return null;
  await tx.query(
    `WITH marks AS (${DAY_MARKS}),
     kept AS (
       SELECT c.id, fresh.day_id AS new_day, old.day_id AS old_day
         FROM plan_check_issues c
         LEFT JOIN marks old ON old.day_id = c.day_id
         LEFT JOIN marks fresh ON fresh.version_id = $2 AND fresh.day_no = old.day_no
                              AND fresh.mark = old.mark
        WHERE c.trip_id = $1 AND c.version_id <> $2
          AND (c.day_id IS NULL OR fresh.day_id IS NOT NULL)
     ), moved AS (
       UPDATE plan_check_issues c
          SET version_id = $2, day_id = kept.new_day,
              fingerprint = CASE WHEN kept.old_day IS NULL THEN c.fingerprint
                                 ELSE replace(c.fingerprint, kept.old_day::text, kept.new_day::text)
                            END
         FROM kept WHERE c.id = kept.id
       RETURNING c.id
     )
     DELETE FROM plan_check_issues c
      WHERE c.trip_id = $1 AND c.version_id <> $2 AND c.id NOT IN (SELECT id FROM kept)`,
    [tripId, versionId],
  );
  if (trip.crew) {
    await tx.query(
      `INSERT INTO plan_checks AS c (trip_id, version_id, status, fix_count, know_count)
       SELECT $1, $2, 'queued', count(*) FILTER (WHERE i.severity = 'fix')::int,
              count(*) FILTER (WHERE i.severity = 'know')::int
         FROM (SELECT severity FROM plan_check_issues WHERE trip_id = $1 AND version_id = $2) i
       ON CONFLICT (trip_id) DO UPDATE
         SET version_id = EXCLUDED.version_id, status = 'queued',
             fix_count = EXCLUDED.fix_count, know_count = EXCLUDED.know_count`,
      [tripId, versionId],
    );
  }
  return versionId;
}

/** Both carries for a trip whose plan just changed; safe to call again in the same transaction. */
export async function carryPlanForward(tx: pg.PoolClient, tripId: string): Promise<void> {
  await asSystemRole(tx, async () => {
    await carryLegs(tx, tripId);
    await carryCheck(tx, tripId);
  });
}
