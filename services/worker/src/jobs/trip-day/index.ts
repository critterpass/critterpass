/**
 * Trip day jobs, wired from the worker's environment: leave-bys route on Mapbox traffic when
 * `MAPBOX_TOKEN` is set (a flagged straight-line estimate otherwise). Building the jobs also hooks
 * the leave-by recompute onto the events this process appends and registers the trip day pushes,
 * once per process.
 */
import type { AssertRouteOn, Telemetry } from '@cp/ai';
import { onEventAppended } from '@cp/db';
import type { RouteEtaProvider } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { tripDayEventHook } from './hooks';
import { leaveByRecomputeJob } from './leaveby-recompute';
import { leaveByScheduleJob } from './leaveby-schedule';
import { registerTripDayNotifications } from './notify';
import { mapboxLeaveByRouter, straightLineLeaveByRouter } from './route-eta';

export { tripDayEventHook } from './hooks';
export { registerTripDayNotifications } from './notify';

export interface TripDayJobsEnv {
  readonly MAPBOX_TOKEN?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export function leaveByRouterFrom(env: TripDayJobsEnv): RouteEtaProvider {
  const token = env.MAPBOX_TOKEN;
  if (token === undefined || token.length === 0) return straightLineLeaveByRouter;
  return mapboxLeaveByRouter({ accessToken: token });
}

let registered = false;

export function tripDayJobs(
  env: TripDayJobsEnv,
  _pool: pg.Pool,
  _assertRouteOn: AssertRouteOn,
  _telemetry?: Telemetry,
): AnyJobDefinition[] {
  if (!registered) {
    registered = true;
    onEventAppended(tripDayEventHook);
    registerTripDayNotifications();
  }
  const router = leaveByRouterFrom(env);
  return [leaveByRecomputeJob(router), leaveByScheduleJob(router)];
}
