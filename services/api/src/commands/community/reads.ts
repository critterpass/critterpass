/**
 * The crew plan reads behind `/v1/shared-plans` (docs/
 * api-contracts.md §5.5). Published plans are read only through their projection; ranking is the
 * pure `matchScore` against the viewing crew, never copies or saves.
 */
import {
  crewTasteTags,
  matchScore,
  sharedPlanProjectionSchema,
  type CrewTaste,
  type SharedPlanCard,
  type SharedPlanGuideNote,
  type SharedPlansPage,
  type SharedPlansQuery,
} from '@cp/domain';
import type pg from 'pg';

import { tripForSharing } from './skeleton';

export const SHARED_PLANS_PAGE_SIZE = 20;
/** The most published plans of one destination one browse ranks. */
const RANKED_LIMIT = 500;

interface PlanRow {
  id: string;
  title: string | null;
  projection: unknown;
  taste: Record<string, number>;
  tags: string[];
  days_count: number;
  travel_month: number | null;
  travel_year: number | null;
  crew_size: number;
  cost_pp_rounded_minor: string | null;
  currency: string | null;
  rating_avg: string | null;
  rating_count: number;
  copies_count: number;
  travelled: boolean;
  published_at: Date | null;
}

const PLAN_COLUMNS = `id, title, projection, taste, tags, days_count, travel_month, travel_year,
  crew_size, cost_pp_rounded_minor, currency, rating_avg, rating_count, copies_count, travelled,
  published_at`;

function card(row: PlanRow, match: number | null): SharedPlanCard {
  const projection = sharedPlanProjectionSchema.safeParse(row.projection);
  return {
    id: row.id,
    title: row.title,
    destination_name: projection.success ? projection.data.destination_name : '',
    tags: row.tags,
    days_count: row.days_count,
    travel_month: row.travel_month,
    travel_year: row.travel_year,
    crew_size: row.crew_size,
    crew_names: projection.success ? projection.data.crew_names : null,
    cost_pp_rounded_minor:
      row.cost_pp_rounded_minor === null ? null : Number(row.cost_pp_rounded_minor),
    currency: row.currency,
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    rating_count: row.rating_count,
    copies_count: row.copies_count,
    travelled: row.travelled,
    match_pct: match,
  };
}

/** The viewing crew's taste: the trip's seat holders' crew-visible tags, its month and size. */
export async function crewTaste(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<CrewTaste> {
  const { rows } = await tx.query<{ tags: string[] }>(
    `SELECT coalesce(tp.tags, '{}') AS tags
       FROM trip_participants p LEFT JOIN taste_profiles tp ON tp.user_id = p.user_id
                                 AND (tp.visibility = 'crew' OR tp.user_id = $2)
      WHERE p.trip_id = $1 AND p.holds_seat`,
    [tripId, uid],
  );
  const trip = await tripForSharing(tx, tripId);
  const month = trip?.start_date == null ? null : Number(trip.start_date.slice(5, 7));
  return {
    tags: crewTasteTags(rows.map((row) => row.tags)),
    crew_size: Math.max(1, rows.length),
    month,
    budget_pp_minor: null,
  };
}

export async function soloTaste(tx: pg.PoolClient, uid: string): Promise<CrewTaste> {
  const { rows } = await tx.query<{ tags: string[] }>(
    'SELECT tags FROM taste_profiles WHERE user_id = $1',
    [uid],
  );
  return {
    tags: crewTasteTags(rows.map((row) => row.tags)),
    crew_size: 1,
    month: null,
    budget_pp_minor: null,
  };
}

export async function browseSharedPlans(
  tx: pg.PoolClient,
  query: SharedPlansQuery,
  taste: CrewTaste | null,
): Promise<SharedPlansPage> {
  const tags = (query.tags ?? '').split(',').filter((tag) => tag !== '');
  const { rows } = await tx.query<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM shared_plans
      WHERE status = 'published' AND destination_id = $1
        AND ($2::int IS NULL OR days_count >= $2) AND ($3::int IS NULL OR days_count <= $3)
        AND ($4::int IS NULL OR travel_month = $4)
        AND ($5::int IS NULL OR crew_size >= $5) AND ($6::int IS NULL OR crew_size <= $6)
        AND ($7::bigint IS NULL OR cost_pp_rounded_minor <= $7)
        AND (cardinality($8::text[]) = 0 OR tags @> $8::text[])
      ORDER BY published_at DESC, id LIMIT ${RANKED_LIMIT}`,
    [
      query.destination_id,
      query.days_min ?? null,
      query.days_max ?? null,
      query.month ?? null,
      query.crew_min ?? null,
      query.crew_max ?? null,
      query.max_cost_minor ?? null,
      tags,
    ],
  );
  const scored = rows.map((row) => ({
    row,
    match:
      taste === null
        ? null
        : matchScore(taste, {
            taste: row.taste,
            crew_size: row.crew_size,
            travel_month: row.travel_month,
            cost_pp_minor:
              row.cost_pp_rounded_minor === null ? null : Number(row.cost_pp_rounded_minor),
          }),
  }));
  const byMatch = [...scored].sort((a, b) => (b.match ?? 0) - (a.match ?? 0));
  const ordered =
    query.sort === 'newest'
      ? scored
      : query.sort === 'rating'
        ? [...scored].sort((a, b) => Number(b.row.rating_avg ?? 0) - Number(a.row.rating_avg ?? 0))
        : byMatch;
  const start = query.cursor ?? 0;
  const page = ordered.slice(start, start + SHARED_PLANS_PAGE_SIZE);
  const next = start + SHARED_PLANS_PAGE_SIZE;
  return {
    plans: page.map((entry) => card(entry.row, entry.match)),
    pick_id: taste === null ? null : (byMatch[0]?.row.id ?? null),
    total: rows.length,
    next_cursor: next < ordered.length ? next : null,
  };
}

export async function sharedPlanRow(tx: pg.PoolClient, id: string) {
  const { rows } = await tx.query<PlanRow & { status: string; trip_id: string }>(
    `SELECT ${PLAN_COLUMNS}, status, trip_id FROM shared_plans
      WHERE id = $1 AND status IN ('published', 'unpublished')`,
    [id],
  );
  return rows[0] ?? null;
}

export { card as sharedPlanCard };

/** Which of the plan's days visit places the crew's trip already has, and the day richest in new ones. */
export async function guideNote(
  tx: pg.PoolClient,
  projection: { days: { day_no: number; places: { poi_id: string }[] }[] },
  tripId: string,
): Promise<SharedPlanGuideNote> {
  const { rows } = await tx.query<{ poi_id: string }>(
    `SELECT poi_id FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL AND poi_id IS NOT NULL
     UNION
     SELECT i.poi_id FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
      WHERE t.id = $1 AND i.poi_id IS NOT NULL`,
    [tripId],
  );
  const have = new Set(rows.map((row) => row.poi_id));
  const overlapDays: number[] = [];
  let best: { day: number; fresh: number } | null = null;
  let overlap = 0;
  let fresh = 0;
  for (const day of projection.days) {
    const shared = day.places.filter((place) => have.has(place.poi_id)).length;
    const unseen = day.places.length - shared;
    overlap += shared;
    fresh += unseen;
    if (shared > 0) overlapDays.push(day.day_no);
    if (unseen > 0 && (best === null || unseen > best.fresh))
      best = { day: day.day_no, fresh: unseen };
  }
  return {
    overlap_days: overlapDays,
    best_day: best?.day ?? null,
    overlap_places: overlap,
    new_places: fresh,
  };
}
