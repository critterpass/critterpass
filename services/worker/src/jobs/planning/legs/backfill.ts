/**
 * Backfills stored legs for every trip in planning, pre or in that has a live plan version, one
 * trip at a time, with the same code the `plan.legs` job runs. Writes `plan_legs` and
 * `route_cache`; run it once per environment after the Valhalla service is up:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/jobs/planning/legs/backfill.ts [--dry-run]
 *
 * `--dry-run` lists the trips it would refresh and writes nothing.
 */
import { createPool, withSystem } from '@cp/db';

import { workerPlanningTravel } from './index';
import { refreshTripLegs } from './job';
import { LIVE_VERSION_STATUSES } from './load';

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const pool = createPool({ connectionString, max: 2 });
  try {
    const trips = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT t.id FROM trips t
          WHERE t.phase IN ('planning', 'pre', 'in')
            AND EXISTS (SELECT 1 FROM itinerary_versions v
                         WHERE v.trip_id = t.id AND v.status = ANY($1::text[]))
          ORDER BY t.id`,
        [LIVE_VERSION_STATUSES],
      );
      return rows.map((row) => row.id);
    });
    console.log(`trips with a live plan: ${trips.length}`);
    if (process.argv.includes('--dry-run')) return;
    let fallbacks = 0;
    const travel = workerPlanningTravel(pool, process.env['VALHALLA_URL'], () => {
      fallbacks += 1;
    });
    const totals = { legs: 0, changed: 0, approx: 0 };
    for (const tripId of trips) {
      const result = await refreshTripLegs(pool, travel, tripId);
      totals.legs += result.legs;
      totals.changed += result.changed;
      totals.approx += result.approx;
    }
    console.log(
      `legs ${totals.legs}, rows changed ${totals.changed}, about ${totals.approx}, router fallbacks ${fallbacks}`,
    );
  } finally {
    await pool.end();
  }
}

await main();
