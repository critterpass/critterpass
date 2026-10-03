/**
 * `places.fsq_match` (docs/api-contracts-async.md §2.3): links curated POIs to their Foursquare ids
 * so `GET /v1/places/{id}/live` can fetch their details. Monthly for every destination (the cron
 * payload is empty), or for one destination when sent with `{destination}`. Without
 * `FOURSQUARE_API_KEY` the job is not registered.
 */
import { foursquareMatchJobSchema, PLACES_QUEUES } from '@cp/domain';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import { runFoursquareMatch, type FoursquareMatchConfig } from '../../places/foursquare-match';

export interface PlaceDetailsJobsEnv {
  readonly FOURSQUARE_API_KEY?: string | undefined;
  readonly FOURSQUARE_MONTHLY_CALL_CAP: number;
}

export function foursquareMatchJob(config: FoursquareMatchConfig): AnyJobDefinition {
  return defineJob({
    queue: PLACES_QUEUES.foursquareMatch,
    schema: foursquareMatchJobSchema.nullish(),
    async handler(data, { pool, logger, job }) {
      const report = await runFoursquareMatch(
        pool,
        config,
        {
          ...(data?.destination === undefined ? {} : { destination: data.destination }),
          signal: job.signal,
        },
        logger,
      );
      logger.info({ ...report }, 'foursquare id matching finished');
      return { ...report };
    },
  });
}

export function placeDetailsJobs(env: PlaceDetailsJobsEnv, logger: JobLogger): AnyJobDefinition[] {
  if (env.FOURSQUARE_API_KEY === undefined) {
    logger.warn({}, 'places.fsq_match is off: FOURSQUARE_API_KEY is unset');
    return [];
  }
  return [
    foursquareMatchJob({
      apiKey: env.FOURSQUARE_API_KEY,
      monthlyCallCap: env.FOURSQUARE_MONTHLY_CALL_CAP,
    }),
  ];
}
