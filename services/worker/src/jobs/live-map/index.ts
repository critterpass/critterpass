/**
 * Crew live map jobs and pushes, wired from the worker's environment: the ETA recount routes on
 * Valhalla when `VALHALLA_URL` is set, otherwise every ETA is a straight-line estimate ("about").
 */
import type { AnyJobDefinition } from '../../boss';
import { etaMeetupsJob } from './eta-meetups';
import { locationExpireJob } from './location-expire';
import { straightLineRouter, valhallaRouter } from './meetup-router';

export { registerLiveMapNotifications } from './notify';

export interface LiveMapJobsEnv {
  readonly VALHALLA_URL?: string | undefined;
}

export function liveMapJobs(
  env: LiveMapJobsEnv,
  onRouterError?: (error: unknown) => void,
): AnyJobDefinition[] {
  const router =
    env.VALHALLA_URL === undefined
      ? straightLineRouter
      : valhallaRouter({
          baseUrl: env.VALHALLA_URL,
          ...(onRouterError === undefined ? {} : { onError: onRouterError }),
        });
  return [etaMeetupsJob(router), locationExpireJob()];
}
