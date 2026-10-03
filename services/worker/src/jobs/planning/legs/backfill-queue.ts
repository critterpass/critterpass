/**
 * Queues one `plan.legs` run per trip in planning, pre or in that has a live plan, so the worker
 * routes them inside the private network where Valhalla is. Runs share the job's singleton key
 * (a trip that already has a run waiting is counted, not queued twice) and start spread over time
 * (`perMinute`, after the usual 30 s debounce) so a thousand trips never land on the router at once.
 */
import { sendInTx, withSystem } from '@cp/db';
import { PLAN_LEGS_DEBOUNCE_SECONDS, PLANNING_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { LIVE_VERSION_STATUSES } from './load';

export interface LegsBackfillResult {
  readonly trips: number;
  readonly queued: number;
  readonly alreadyQueued: number;
  /** Seconds from now until the last run starts. */
  readonly lastStartsIn: number;
}

const BATCH = 100;

export async function queueLegsBackfill(
  pool: pg.Pool,
  options: { readonly dryRun?: boolean; readonly perMinute?: number } = {},
): Promise<LegsBackfillResult> {
  const perMinute = Math.max(1, options.perMinute ?? 60);
  const trips = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ trip_id: string; version_id: string }>(
      `SELECT t.id AS trip_id,
              coalesce(t.current_version_id,
                       (SELECT v.id FROM itinerary_versions v
                         WHERE v.trip_id = t.id AND v.status = ANY($1::text[])
                         ORDER BY v.created_at DESC LIMIT 1)) AS version_id
         FROM trips t
        WHERE t.phase IN ('planning', 'pre', 'in')
          AND EXISTS (SELECT 1 FROM itinerary_versions v
                       WHERE v.trip_id = t.id AND v.status = ANY($1::text[]))
        ORDER BY t.id`,
      [LIVE_VERSION_STATUSES],
    );
    return rows;
  });
  const startAfter = (index: number) =>
    PLAN_LEGS_DEBOUNCE_SECONDS + Math.floor((index * 60) / perMinute);
  const lastStartsIn = trips.length === 0 ? 0 : startAfter(trips.length - 1);
  if (options.dryRun === true) {
    return { trips: trips.length, queued: 0, alreadyQueued: 0, lastStartsIn };
  }
  let queued = 0;
  for (let start = 0; start < trips.length; start += BATCH) {
    const batch = trips.slice(start, start + BATCH);
    queued += await withSystem(pool, async (tx) => {
      let sent = 0;
      for (const [offset, trip] of batch.entries()) {
        const id = await sendInTx(tx, PLANNING_QUEUES.legs, trip, {
          singletonKey: `legs:${trip.trip_id}`,
          startAfter: startAfter(start + offset),
        });
        if (id !== null) sent += 1;
      }
      return sent;
    });
  }
  return { trips: trips.length, queued, alreadyQueued: trips.length - queued, lastStartsIn };
}
