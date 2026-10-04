/**
 * Moving trips that have not started to the guide of their city, once guides are assigned per
 * city. Callers run as `app_system`.
 */
import type pg from 'pg';

import { guidesPerCity } from './assignment';

export interface RepointResult {
  readonly perCity: boolean;
  /** Trips that have not started and now point at their city's guide. */
  readonly moved: number;
}

/**
 * Moves every trip that has not started to the guide of its destination. Trips that are under
 * way, over or cancelled keep their guide. Does nothing while guides are assigned per place; a
 * dry run counts the trips that would move and writes nothing.
 */
export async function repointTripGuides(
  tx: pg.PoolClient,
  options: { readonly dryRun?: boolean } = {},
): Promise<RepointResult> {
  if (!(await guidesPerCity(tx))) return { perCity: false, moved: 0 };
  // Trips that have not started and are not on their destination's guide yet.
  const due = `(SELECT d.id, app.destination_guide_id(d.id) AS guide_id FROM destinations d) city
      WHERE city.id = t.destination_id
        AND t.phase IN ('planning', 'pre')
        AND city.guide_id IS NOT NULL
        AND t.guide_id IS DISTINCT FROM city.guide_id`;
  if (options.dryRun === true) {
    const { rows } = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM trips t JOIN ${due.replace('WHERE', 'ON')}`,
    );
    return { perCity: true, moved: rows[0]?.n ?? 0 };
  }
  const { rowCount } = await tx.query(`UPDATE trips t SET guide_id = city.guide_id FROM ${due}`);
  return { perCity: true, moved: rowCount ?? 0 };
}
