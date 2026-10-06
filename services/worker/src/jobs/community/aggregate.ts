/**
 * `community.aggregate` (nightly): counts every place's loved / fine / skip verdicts for its
 * social proof, and rates each published crew plan from the verdicts of the crews that copied it
 * on the places the plan holds (loved 5, fine 3, skip 1; shown once three crews rated it).
 */
import { withSystem } from '@cp/db';
import { COMMUNITY_QUEUES, communityQueueSpecs } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { DEFAULT_QUEUE_SPEC, defineJob, type JobDefinition } from '../../boss';

export async function aggregateRatings(pool: pg.Pool): Promise<{ places: number; plans: number }> {
  return withSystem(pool, async (tx) => {
    const places = await tx.query(
      `INSERT INTO place_rating_stats (poi_id, loved, fine, skip, updated_at)
       SELECT poi_id, count(*) FILTER (WHERE verdict = 'loved'),
              count(*) FILTER (WHERE verdict = 'fine'), count(*) FILTER (WHERE verdict = 'skip'),
              now()
         FROM ratings GROUP BY poi_id
       ON CONFLICT (poi_id) DO UPDATE
          SET loved = EXCLUDED.loved, fine = EXCLUDED.fine, skip = EXCLUDED.skip,
              updated_at = EXCLUDED.updated_at
        WHERE (place_rating_stats.loved, place_rating_stats.fine, place_rating_stats.skip)
              IS DISTINCT FROM (EXCLUDED.loved, EXCLUDED.fine, EXCLUDED.skip)`,
    );
    const plans = await tx.query(
      `WITH scored AS (
         SELECT c.shared_plan_id,
                avg(CASE r.verdict WHEN 'loved' THEN 5 WHEN 'fine' THEN 3 ELSE 1 END) AS avg,
                count(DISTINCT c.trip_id)::int AS crews
           FROM shared_plan_copies c
           JOIN shared_plans s ON s.id = c.shared_plan_id AND s.status = 'published'
           JOIN ratings r ON r.trip_id = c.trip_id
            AND r.poi_id IN (SELECT (place->>'poi_id')::uuid
                               FROM jsonb_array_elements(s.projection->'days') AS day,
                                    jsonb_array_elements(day->'places') AS place)
          GROUP BY c.shared_plan_id
       )
       UPDATE shared_plans s SET rating_avg = round(scored.avg, 2), rating_count = scored.crews
         FROM scored
        WHERE s.id = scored.shared_plan_id
          AND (s.rating_avg, s.rating_count) IS DISTINCT FROM (round(scored.avg, 2), scored.crews)`,
    );
    return { places: places.rowCount ?? 0, plans: plans.rowCount ?? 0 };
  });
}

export function communityAggregateJob(): JobDefinition<Record<string, unknown>> {
  return defineJob({
    queue: COMMUNITY_QUEUES.aggregate,
    spec: communityQueueSpecs(DEFAULT_QUEUE_SPEC)[COMMUNITY_QUEUES.aggregate],
    schema: z.record(z.string(), z.unknown()),
    handler: async (_data, ctx) => aggregateRatings(ctx.pool),
  });
}
