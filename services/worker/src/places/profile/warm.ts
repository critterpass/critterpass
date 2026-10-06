/**
 * Profiles written before anyone opens the page: a destination's top places, essentials and
 * must-sees first, then the best-ranked others (machine picks, then the search quality score).
 * Places with a reviewed note, a profile already, or a kind that gets none are passed over. The
 * jobs are spread out in time (`spacingSeconds` apart, after `offsetSeconds`) and sent at the
 * given priority, so a warm-up never arrives as a burst ahead of a reader's own request.
 */
import { withSystem } from '@cp/db';
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
      `SELECT top.id FROM (
         SELECT p.id, p.editorial, p.category
           FROM pois p
          WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
          ORDER BY coalesce((p.editorial->>'essential')::bool, false) DESC,
                   coalesce((p.editorial->>'must_see')::bool, false) DESC,
                   p.pick_rank NULLS LAST, coalesce(p.confidence, 0) DESC, p.id
          LIMIT $2
       ) top
       WHERE NOT coalesce(top.editorial ? 'why_go', false)
         AND top.category NOT IN ('transit', 'health')
         AND NOT EXISTS (SELECT 1 FROM place_profiles pp WHERE pp.poi_id = top.id AND pp.basis = 'web')`,
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

/** Queues the destination's top places; returns how many jobs were sent. */
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
