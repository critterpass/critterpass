/**
 * `plan.legs`: works out and stores the travel between the stops of every live version of a trip
 * (organiser drafts, proposals, the current plan), so the day plan shows "CAR · 1H10" and
 * "5 STOPS · 2H40 IN THE CAR" offline. Routing happens outside any transaction; each version's
 * legs are then written in one short transaction with `plan.legs_updated` (the plan check listens)
 * and a `legs.updated` hint for open screens. A run that changes nothing writes nothing.
 */
import { withSystem } from '@cp/db';
import {
  DEFAULT_QUEUE_SPEC,
  PLANNING_QUEUES,
  planLegsJobSchema,
  planningQueueSpecs,
} from '@cp/domain';
import type { PlanningTravel } from '@cp/suppliers';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../../boss';
import { computeVersionLegs } from './compute';
import { loadTripLegsInput } from './load';
import { dropStaleVersionLegs, writeVersionLegs } from './write';

export interface TripLegsResult {
  readonly versions: number;
  readonly legs: number;
  readonly changed: number;
  readonly approx: number;
}

export async function refreshTripLegs(
  pool: pg.Pool,
  travel: PlanningTravel,
  tripId: string,
): Promise<TripLegsResult> {
  const input = await withSystem(pool, (tx) => loadTripLegsInput(tx, tripId));
  if (input === null) return { versions: 0, legs: 0, changed: 0, approx: 0 };
  let legs = 0;
  let changed = 0;
  let approx = 0;
  for (const version of input.versions) {
    const computed = await computeVersionLegs(travel, version.days, input.driveFactor);
    legs += computed.length;
    approx += computed.filter((leg) => leg.approx).length;
    const written = await withSystem(pool, (tx) =>
      writeVersionLegs(tx, tripId, version.versionId, computed),
    );
    changed += written.changed;
  }
  changed += await withSystem(pool, (tx) => dropStaleVersionLegs(tx, tripId));
  return { versions: input.versions.length, legs, changed, approx };
}

export function planLegsJob(travel: PlanningTravel): AnyJobDefinition {
  return defineJob({
    queue: PLANNING_QUEUES.legs,
    spec: planningQueueSpecs(DEFAULT_QUEUE_SPEC)[PLANNING_QUEUES.legs],
    schema: planLegsJobSchema,
    singletonKey: (data) => `legs:${data.trip_id}`,
    async handler(data, { pool }) {
      return { ...(await refreshTripLegs(pool, travel, data.trip_id)) };
    },
  });
}
