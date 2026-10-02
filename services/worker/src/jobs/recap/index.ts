/**
 * Recap jobs, wired from the worker's environment, and (once per process) the hook that queues a
 * build when a trip ends or late data lands. Leg distances route on Valhalla when `VALHALLA_URL` is
 * set, otherwise every leg is a straight-line estimate the recap marks as such.
 */
import { onEventAppended } from '@cp/db';

import type { AnyJobDefinition } from '../../boss';
import { straightLineRouter, valhallaRouter } from '../live-map/meetup-router';
import { recapBuildJob } from './build';
import { recapEventHook } from './rerun';

export { registerRecapContributor } from './contributors';

export interface RecapJobsEnv {
  readonly VALHALLA_URL?: string | undefined;
}

let hooked = false;

export function recapJobs(
  env: RecapJobsEnv,
  onRouterError?: (error: unknown) => void,
): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(recapEventHook);
  }
  const router =
    env.VALHALLA_URL === undefined
      ? straightLineRouter
      : valhallaRouter({
          baseUrl: env.VALHALLA_URL,
          ...(onRouterError === undefined ? {} : { onError: onRouterError }),
        });
  return [recapBuildJob({ router })];
}
