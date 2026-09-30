/**
 * Trip day jobs, wired from the worker's environment: leave-bys route on Mapbox traffic when
 * `MAPBOX_TOKEN` is set (a flagged straight-line estimate otherwise). Building the jobs also hooks
 * the leave-by recompute onto the events this process appends and registers the trip day pushes,
 * once per process.
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { onEventAppended } from '@cp/db';
import type { RouteEtaProvider } from '@cp/domain';

import type { AnyJobDefinition } from '../../boss';
import { briefingJob, type BriefingWriter } from './briefing-build';
import { tripDayEventHook } from './hooks';
import { leaveByRecomputeJob } from './leaveby-recompute';
import { leaveByScheduleJob } from './leaveby-schedule';
import { registerTripDayNotifications } from './notify';
import { mapboxLeaveByRouter, straightLineLeaveByRouter } from './route-eta';

export { tripDayEventHook } from './hooks';
export { registerTripDayNotifications } from './notify';
export { insertBriefingItem } from './briefing-insert-event';

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

function briefingWriter(
  env: TripDayJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry: Telemetry | undefined,
): BriefingWriter | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) return undefined;
  return (onUsage) =>
    createGateway({
      apiKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      ...(telemetry === undefined ? {} : { telemetry }),
      onUsage,
      assertRouteOn,
    });
}

export function tripDayJobs(
  env: TripDayJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  if (!registered) {
    registered = true;
    onEventAppended(tripDayEventHook);
    registerTripDayNotifications();
  }
  const router = leaveByRouterFrom(env);
  return [
    leaveByRecomputeJob(router),
    leaveByScheduleJob(router),
    briefingJob(briefingWriter(env, assertRouteOn, telemetry)),
  ];
}
