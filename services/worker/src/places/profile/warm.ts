/**
 * Profiles written before anyone opens the page: a destination's popular places
 * (`popularPlaces` in `@cp/db`), in their order. Places with a reviewed note or a profile already
 * are passed over. The jobs are spread out in time (`spacingSeconds` apart, after `offsetSeconds`) and sent at the
 * given priority, so a warm-up never arrives as a burst ahead of a reader's own request.
 */
import { POPULAR_PLACES_SQL, withSystem } from '@cp/db';
import { PLACES_QUEUES, placesProfileKey } from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

/** Job priorities: a reader waiting on a page first, a pitch or trip next, the pre-fill last. */
export const PROFILE_PRIORITY = { reader: 10, warm: 0, prefill: -10 } as const;

export async function warmPlaces(
  pool: pg.Pool,
  destinationId: string,
  limit: number,
): Promise<string[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT popular.poi_id AS id
         FROM (${POPULAR_PLACES_SQL}) popular
         JOIN pois p ON p.id = popular.poi_id
        WHERE NOT coalesce(p.editorial ? 'why_go', false)
          AND NOT EXISTS (
            SELECT 1 FROM place_profiles pp
             WHERE pp.poi_id = p.id AND pp.basis = 'web'
               -- A run stopped at an earlier day's spent cap is queued again.
               AND NOT (pp.status = 'failed' AND pp.error = 'daily_cap'
                        AND pp.updated_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
        ORDER BY popular.popular_rank
        LIMIT $2`,
      [destinationId, limit],
    );
    return rows.map((row) => row.id);
  });
}

export interface WarmOptions {
  readonly limit: number;
  readonly priority: number;
  readonly spacingSeconds: number;
  readonly offsetSeconds?: number;
}

/** Queues the destination's popular places; returns how many jobs were sent. */
export async function queueWarmProfiles(
  pool: pg.Pool,
  boss: Pick<PgBoss, 'send'>,
  destinationId: string,
  options: WarmOptions,
): Promise<number> {
  const ids = await warmPlaces(pool, destinationId, options.limit);
  let sent = 0;
  for (const [i, poiId] of ids.entries()) {
    const id = await boss.send(
      PLACES_QUEUES.profile,
      { poi_id: poiId },
      {
        singletonKey: placesProfileKey(poiId),
        priority: options.priority,
        startAfter: (options.offsetSeconds ?? 0) + i * options.spacingSeconds,
      },
    );
    if (id !== null) sent += 1;
  }
  return sent;
}
