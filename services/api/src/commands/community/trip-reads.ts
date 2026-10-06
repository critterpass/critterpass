/**
 * A trip's own community reads, for its members: the publishing state behind Share the plan (its
 * consents counted, never named; the skeleton the preview is built from) and the places a
 * participant can rate.
 */
import {
  POI_CATEGORIES,
  sharedPlanTogglesSchema,
  type ConsentDecision,
  type PoiCategory,
  type SharedPlanStatus,
  type TripRatingCards,
  type TripSharedPlan,
} from '@cp/domain';
import type pg from 'pg';

import { loadPlanSkeleton, tripForSharing } from './skeleton';

export async function tripSharedPlan(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<TripSharedPlan> {
  const trip = await tripForSharing(tx, tripId);
  const skeleton = trip === null ? null : await loadPlanSkeleton(tx, trip);
  const { rows: organiser } = await tx.query(
    "SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2 AND role = 'organiser'",
    [tripId, uid],
  );
  const { rows } = await tx.query<{
    id: string;
    status: SharedPlanStatus;
    toggles: unknown;
    requested_by: string | null;
    copies_count: number;
    saves_count: number;
    rating_avg: string | null;
    rating_count: number;
    published_at: Date | null;
    my_decision: ConsentDecision | null;
    approved: number;
    total: number;
  }>(
    `SELECT s.id, s.status, s.toggles, s.requested_by, s.copies_count, s.saves_count, s.rating_avg,
            s.rating_count, s.published_at,
            (SELECT decision FROM shared_plan_consents WHERE shared_plan_id = s.id AND user_id = $2)
              AS my_decision,
            (SELECT count(*) FILTER (WHERE decision = 'approved')::int FROM shared_plan_consents
              WHERE shared_plan_id = s.id) AS approved,
            (SELECT count(*)::int FROM shared_plan_consents WHERE shared_plan_id = s.id) AS total
       FROM shared_plans s WHERE s.trip_id = $1
      ORDER BY s.created_at DESC LIMIT 1`,
    [tripId, uid],
  );
  const { rows: links } = await tx.query<{ id: string; created_at: Date; revoked_at: Date | null }>(
    'SELECT id, created_at, revoked_at FROM plan_links WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 20',
    [tripId],
  );
  const row = rows[0];
  return {
    organiser: organiser.length > 0,
    plan:
      row === undefined
        ? null
        : {
            id: row.id,
            status: row.status,
            toggles: sharedPlanTogglesSchema.parse(row.toggles),
            requested_by_me: row.requested_by === uid,
            my_decision: row.my_decision,
            consents: { approved: row.approved, total: row.total },
            copies_count: row.copies_count,
            saves_count: row.saves_count,
            rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
            rating_count: row.rating_count,
            published_at: row.published_at?.toISOString() ?? null,
          },
    skeleton,
    links: links.map((link) => ({
      id: link.id,
      created_at: link.created_at.toISOString(),
      revoked_at: link.revoked_at?.toISOString() ?? null,
    })),
  };
}

function categoryOf(value: string | null): PoiCategory {
  return (POI_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as PoiCategory)
    : 'other';
}

/**
 * The places a participant can rate: those the crew checked in at or the plan put on a day (never
 * a location trail), with the caller's own verdict and tip so a half-rated stack resumes.
 */
export async function tripRatingCards(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<TripRatingCards> {
  const trip = await tripForSharing(tx, tripId);
  const { rows } = await tx.query<{
    poi_id: string;
    name: string;
    category: string | null;
    day_no: number | null;
    verdict: 'loved' | 'fine' | 'skip' | null;
    tip: string | null;
    tip_status: 'none' | 'pending' | 'approved' | 'review' | 'rejected' | null;
  }>(
    `WITH places AS (
       SELECT i.poi_id, min(d.day_no) AS day_no
         FROM plan_items i JOIN plan_days d ON d.id = i.day_id
         JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 AND i.poi_id IS NOT NULL
        GROUP BY i.poi_id
       UNION
       SELECT v.poi_id, NULL FROM visits v WHERE v.trip_id = $1
     ), picked AS (
       SELECT poi_id, min(day_no) AS day_no FROM places GROUP BY poi_id
     )
     SELECT p.id AS poi_id, p.name, p.category, picked.day_no, r.verdict, r.tip, r.tip_status
       FROM picked JOIN pois p ON p.id = picked.poi_id
       LEFT JOIN ratings r ON r.trip_id = $1 AND r.poi_id = p.id AND r.user_id = $2
      WHERE p.category IS DISTINCT FROM 'transit' AND p.category IS DISTINCT FROM 'stay'
      ORDER BY picked.day_no NULLS LAST, p.name
      LIMIT 60`,
    [tripId, uid],
  );
  return {
    destination_name: trip?.destination_name ?? '',
    cards: rows.map((row) => ({
      poi_id: row.poi_id,
      name: row.name,
      category: categoryOf(row.category),
      day_no: row.day_no,
      verdict: row.verdict,
      tip: row.tip,
      tip_status: row.tip_status ?? 'none',
    })),
  };
}
