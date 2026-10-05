/**
 * The plan half of following merged places (`follow-merges.ts`): every version's stops move to the
 * kept record with their times untouched; on a trip that has not started, a day of a live version
 * that would hold the place twice keeps one stop; the version's own record of its places gains the
 * kept one; the stored legs of the stops that moved are dropped; and the trip's legs and check are
 * queued through the sends a plan edit uses.
 */
import type pg from 'pg';

import { queuePlanCheck } from '../jobs/planning/check';
import { queueTripLegs } from '../jobs/planning/legs';

/** `merged (id, kept)`: every merged record with the record its chain of merges ends at. */
export const MERGED = `WITH RECURSIVE chain AS (
    SELECT id, merged_into_id AS kept, 1 AS depth FROM pois WHERE merged_into_id IS NOT NULL
    UNION ALL
    SELECT c.id, p.merged_into_id, c.depth + 1 FROM chain c JOIN pois p ON p.id = c.kept
     WHERE p.merged_into_id IS NOT NULL AND c.depth < 8
  ), merged AS (
    SELECT DISTINCT ON (id) id, kept FROM chain WHERE kept <> id ORDER BY id, depth DESC
  )`;

const LIVE = ['draft', 'proposed', 'current'];

export interface Change {
  readonly what: 'moved' | 'dropped';
  readonly trip_id: string | null;
}

export interface PlanChanges {
  readonly changes: Change[];
  /** Trips with a live version whose stops changed. */
  readonly replanned: string[];
}

export async function followPlans(tx: pg.PoolClient): Promise<PlanChanges> {
  // A day of a plan still being made that would hold the place twice keeps one stop.
  const { rows: gone } = await tx.query<{ trip_id: string; version_id: string; key: string }>(
    `${MERGED}, placed AS (
       SELECT i.id, i.trip_id, i.version_id, i.day_id, i.stable_id, i.starts_at, i.must_do_id,
              coalesce(m.kept, i.poi_id) AS place, (m.id IS NOT NULL) AS follows,
              (i.booking_id IS NOT NULL OR i.locked_reason IS NOT NULL
               OR EXISTS (SELECT 1 FROM leave_bys l WHERE l.plan_item_id = i.id)
               OR EXISTS (SELECT 1 FROM journey_checks j WHERE j.item_id = i.id)) AS held
         FROM plan_items i LEFT JOIN merged m ON m.id = i.poi_id
         JOIN itinerary_versions v ON v.id = i.version_id
         JOIN trips t ON t.id = i.trip_id
        WHERE i.poi_id IS NOT NULL AND i.status IS DISTINCT FROM 'cancelled'
          AND v.status = ANY($1::text[]) AND t.phase IN ('planning', 'pre')
     ), ranked AS (
       SELECT p.*, bool_or(p.follows) OVER (PARTITION BY p.version_id, p.day_id, p.place) AS touched,
              row_number() OVER (PARTITION BY p.version_id, p.day_id, p.place
                                 ORDER BY p.held DESC, p.follows, p.starts_at NULLS LAST,
                                          p.stable_id) AS n
         FROM placed p
     ), gone AS (
       DELETE FROM plan_items i USING ranked r
        WHERE i.id = r.id AND r.touched AND r.n > 1 AND NOT r.held
       RETURNING r.trip_id, r.version_id, r.day_id, r.place, r.must_do_id, r.stable_id
     ), handed AS (
       UPDATE plan_items i SET must_do_id = g.must_do_id
         FROM ranked r JOIN gone g ON g.version_id = r.version_id AND g.day_id = r.day_id
                                  AND g.place = r.place AND g.must_do_id IS NOT NULL
        WHERE i.id = r.id AND r.n = 1 AND i.must_do_id IS NULL
     )
     SELECT trip_id, version_id, stable_id::text AS key FROM gone`,
    [LIVE],
  );
  const { rows: moved } = await tx.query<{ trip_id: string; version_id: string; key: string }>(
    `${MERGED} UPDATE plan_items i SET poi_id = m.kept FROM merged m WHERE i.poi_id = m.id
     RETURNING i.trip_id, i.version_id, i.stable_id::text AS key`,
  );
  const touched = [...gone, ...moved];
  const versions = [...new Set(touched.map((row) => row.version_id))];
  // The version's own record of its places names the kept one on every phone.
  await tx.query(
    `UPDATE itinerary_versions v SET coverage = jsonb_set(
         coalesce(v.coverage, '{}'::jsonb), '{places}',
         coalesce(v.coverage -> 'places', '{}'::jsonb) || coalesce((
           SELECT jsonb_object_agg(p.id::text, jsonb_build_object(
                    'name', p.name, 'category', p.category, 'lat', p.lat, 'lng', p.lng,
                    'editorial', p.curation = 'editorial'))
             FROM pois p
            WHERE p.id IN (SELECT i.poi_id FROM plan_items i
                            WHERE i.version_id = v.id AND i.poi_id IS NOT NULL)
              AND NOT (coalesce(v.coverage -> 'places', '{}'::jsonb) ? p.id::text)), '{}'::jsonb))
      WHERE v.id = ANY($1::uuid[])`,
    [versions],
  );
  // What was stored about the way to and from a stop that moved is about the old pin.
  const { rows: live } = await tx.query<{ trip_id: string }>(
    `WITH stale AS (
       DELETE FROM plan_legs l
        USING unnest($1::uuid[], $2::text[]) AS c(version_id, key)
        WHERE l.version_id = c.version_id AND (l.from_key = c.key OR l.to_key = c.key)
     )
     SELECT DISTINCT v.trip_id FROM itinerary_versions v
      WHERE v.id = ANY($1::uuid[]) AND v.status = ANY($3::text[])`,
    [touched.map((row) => row.version_id), touched.map((row) => row.key), LIVE],
  );
  const replanned = live.map((row) => row.trip_id);
  for (const tripId of replanned) {
    await queueTripLegs(tx, tripId);
    await queuePlanCheck(tx, tripId, 'plan');
  }
  return {
    changes: [
      ...moved.map((row) => ({ what: 'moved' as const, trip_id: row.trip_id })),
      ...gone.map((row) => ({ what: 'dropped' as const, trip_id: row.trip_id })),
    ],
    replanned,
  };
}
