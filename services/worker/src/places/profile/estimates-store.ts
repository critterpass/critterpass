/**
 * A popular place's estimates: whether this run writes them (the place is popular and the
 * `places.estimates.enabled` switch is on), and their write. Busy windows become hourly
 * `crowd_forecasts` curves with source `estimate`, replaced as a set, so a run that names no
 * windows leaves no old estimate curve behind. All as app_system.
 */
import { isPopularPlace, withSystem } from '@cp/db';
import { busyWeek, type PlaceEstimates } from '@cp/domain';
import type pg from 'pg';

export const ESTIMATES_SWITCH = 'places.estimates.enabled';

/** True when the place is popular and the switch is not off. */
export async function wantsEstimates(pool: pg.Pool, poiId: string): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ value: unknown }>(
      'SELECT value FROM ops.ops_config WHERE key = $1',
      [ESTIMATES_SWITCH],
    );
    if (rows[0]?.value === false) return false;
    return isPopularPlace(tx, poiId);
  });
}

export async function saveProfileEstimates(
  pool: pg.Pool,
  poiId: string,
  estimates: PlaceEstimates,
  costMicros: number,
  now: Date,
): Promise<number> {
  const week = busyWeek(estimates.busy?.value ?? []);
  return withSystem(pool, async (tx) => {
    await tx.query(
      `UPDATE place_profiles SET estimates = $2, cost_micros = cost_micros + $3, updated_at = now()
        WHERE poi_id = $1`,
      [poiId, JSON.stringify(estimates), costMicros],
    );
    await tx.query(`DELETE FROM crowd_forecasts WHERE poi_id = $1 AND source = 'estimate'`, [
      poiId,
    ]);
    for (const day of week) {
      await tx.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
         VALUES ($1, $2, $3, 'estimate', $4)`,
        [poiId, day.dow, day.hourly, now],
      );
    }
    return week.length;
  });
}
