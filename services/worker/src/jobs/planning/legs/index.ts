/**
 * Stored legs in the worker: the `plan.legs` job on planning travel (Valhalla when `VALHALLA_URL`
 * is set, straight-line "about" minutes otherwise, read through `route_cache`), the event hook
 * that queues it when a plan version or a stay booking changes in a worker transaction, and the
 * 30-day retention of `route_cache`.
 */
import { onEventAppended, sendInTx, withSystem } from '@cp/db';
import { legsJobFor } from '@cp/domain';
import {
  createPlanningTravel,
  createSqlRouteCache,
  createValhallaClient,
  type PlanningTravel,
  type ValhallaClient,
} from '@cp/suppliers';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../../boss';
import type { JobRegistryDeps } from '../../../job-registry';
import { registerRetentionRule } from '../../maint/retention-rules';
import { planLegsJob } from './job';

/** Queues `plan.legs` for the trip's newest plan version after an event that can move a leg. */
export async function legsEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const request = legsJobFor(event);
  if (request === null) return;
  const { rows } = await tx.query<{ version_id: string | null }>(
    `SELECT coalesce(t.current_version_id,
                     (SELECT v.id FROM itinerary_versions v
                       WHERE v.trip_id = t.id AND v.status IN ('draft', 'proposed')
                       ORDER BY v.created_at DESC LIMIT 1)) AS version_id
       FROM trips t WHERE t.id = $1`,
    [event.tripId],
  );
  const versionId = rows[0]?.version_id;
  if (versionId == null) return;
  await sendInTx(
    tx,
    request.queue,
    { trip_id: event.tripId, version_id: versionId },
    request.options,
  );
}

export function workerPlanningTravel(
  pool: pg.Pool,
  valhalla: ValhallaClient | null,
  onError?: (error: unknown) => void,
): PlanningTravel {
  return createPlanningTravel({
    valhalla,
    cache: createSqlRouteCache((sql, params) =>
      withSystem(pool, (tx) => tx.query(sql, [...params])),
    ),
    ...(onError === undefined ? {} : { onError }),
  });
}

let wired = false;

export function planLegsJobs(deps: JobRegistryDeps): AnyJobDefinition[] {
  if (!wired) {
    wired = true;
    onEventAppended(legsEventHook);
    registerRetentionRule({
      kind: 'direct',
      table: 'route_cache',
      column: 'computed_at',
      ttlDays: 30,
    });
  }
  // One client, so the minutes and the road shapes share the router's circuit breaker.
  const valhalla =
    deps.env.VALHALLA_URL === undefined
      ? null
      : createValhallaClient({ baseUrl: deps.env.VALHALLA_URL });
  const travel = workerPlanningTravel(deps.pool, valhalla, (error) =>
    deps.logger.warn({ err: error }, 'planning travel fell back to straight-line'),
  );
  return [
    planLegsJob(travel, valhalla, (error) =>
      deps.logger.warn({ err: error }, 'a leg road shape fell back to a straight line'),
    ),
  ];
}
