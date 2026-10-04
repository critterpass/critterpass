/**
 * Queues one `plan.legs` run per trip in planning, pre or in that has a live plan, so the worker
 * routes them inside the private network where Valhalla is. A trip that already has a run waiting
 * is counted, not queued again (the queue's `singleton` policy limits active runs per key, not
 * waiting ones). Runs start spread over time (`perMinute`, after the usual 30 s debounce) so a
 * thousand trips never land on the router at once. `missingShapes` narrows it to trips with a
 * routed leg whose road shape is not stored yet; the run recomputes and rewrites every leg.
 */
import { sendInTx, withSystem } from '@cp/db';
import { PLAN_LEGS_DEBOUNCE_SECONDS, PLANNING_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { LIVE_VERSION_STATUSES } from './load';

export interface LegsBackfillResult {
  readonly trips: number;
  /** Runs queued now (0 on a dry run). */
  readonly queued: number;
  /** Trips whose run was already waiting (on a dry run: found waiting). */
  readonly alreadyQueued: number;
  /** Seconds from now until the last run starts. */
  readonly lastStartsIn: number;
}

const BATCH = 100;

export async function queueLegsBackfill(
  pool: pg.Pool,
  options: {
    readonly dryRun?: boolean;
    readonly perMinute?: number;
    /** Only trips with a routed leg that has no road shape yet. */
    readonly missingShapes?: boolean;
  } = {},
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
          AND (NOT $2::boolean OR EXISTS (SELECT 1 FROM plan_legs l
                                  WHERE l.trip_id = t.id AND l.source = 'valhalla'
                                    AND l.shape IS NULL))
        ORDER BY t.id`,
      [LIVE_VERSION_STATUSES, options.missingShapes === true],
    );
    return rows;
  });
  const waiting = await withSystem(pool, async (tx) => {
    const { rows: exists } = await tx.query<{ ok: boolean }>(
      "SELECT to_regclass('pgboss.job') IS NOT NULL AS ok",
    );
    if (exists[0]?.ok !== true) return new Set<string>();
    const { rows } = await tx.query<{ trip_id: string }>(
      `SELECT DISTINCT data ->> 'trip_id' AS trip_id FROM pgboss.job
        WHERE name = $1 AND state IN ('created', 'retry')`,
      [PLANNING_QUEUES.legs],
    );
    return new Set(rows.map((row) => row.trip_id));
  });
  const toQueue = trips.filter((trip) => !waiting.has(trip.trip_id));
  const alreadyQueued = trips.length - toQueue.length;
  const startAfter = (index: number) =>
    PLAN_LEGS_DEBOUNCE_SECONDS + Math.floor((index * 60) / perMinute);
  const lastStartsIn = toQueue.length === 0 ? 0 : startAfter(toQueue.length - 1);
  if (options.dryRun === true) {
    return { trips: trips.length, queued: 0, alreadyQueued, lastStartsIn };
  }
  let queued = 0;
  for (let start = 0; start < toQueue.length; start += BATCH) {
    const batch = toQueue.slice(start, start + BATCH);
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
  return {
    trips: trips.length,
    queued,
    alreadyQueued: trips.length - queued,
    lastStartsIn,
  };
}
