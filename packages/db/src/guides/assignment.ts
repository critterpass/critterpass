/**
 * How a trip gets its guide. One database function, `app.destination_guide_id`, answers for the
 * poll close and the solo trip writer: the guide of the destination's critter while the switch is
 * on, the guide of the destination's place otherwise.
 */
import type pg from 'pg';

/** The ops switch: on, a trip's guide is its destination's critter; off, its place's guide. */
export const GUIDES_PER_CITY_KEY = 'guides.per_city';

export async function guidesPerCity(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [GUIDES_PER_CITY_KEY],
  );
  return rows[0]?.value === true;
}
