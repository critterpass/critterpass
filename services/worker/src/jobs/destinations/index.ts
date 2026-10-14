/**
 * The destination base-set jobs: the monthly build (`destinations.base_build`, or an operator's
 * run with `dry_run`), the critter match of the rows without one, and one row's facts-only texts
 * under the daily cap. A build queues the match and the texts of every base row still missing
 * them. Without a model key the texts queue is not registered and the match takes the globally
 * nearest critter for the residual.
 */
import type { AssertRouteOn, Telemetry } from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  DESTINATIONS_QUEUES,
  destinationsBaseBuildJobSchema,
  destinationsCritterMatchJobSchema,
  destinationsDescribeJobSchema,
  destinationsDescribeKey,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { destinationsAi, type DestinationsAiEnv } from '../../destinations/ai-deps';
import { runBaseBuild } from '../../destinations/base/run';
import { describeBaseDestination } from '../../destinations/describe';
import { matchBaseCritters } from '../../destinations/match';

export interface DestinationsJobsEnv extends DestinationsAiEnv {
  readonly DESTINATIONS_DESCRIBE_DAILY_CAP_USD: number;
}

/** Texts start at most this many a minute after a build. */
const DESCRIBES_PER_MINUTE = 30;

export function destinationsJobs(
  env: DestinationsJobsEnv,
  deps: {
    readonly pool: pg.Pool;
    readonly assertRouteOn: AssertRouteOn;
    readonly telemetry?: Telemetry;
  },
): AnyJobDefinition[] {
  const ai = destinationsAi(env, deps);
  const jobs: AnyJobDefinition[] = [
    defineJob({
      queue: DESTINATIONS_QUEUES.baseBuild,
      schema: destinationsBaseBuildJobSchema.nullish(),
      async handler(data, { pool, boss, logger }) {
        const summary = await runBaseBuild(pool, { dryRun: data?.dry_run === true });
        logger.info({ summary }, 'destination base set built');
        if (summary.dryRun) return summary;
        await boss.send(DESTINATIONS_QUEUES.critterMatch, {});
        if (ai !== null) {
          const ids = await withSystem(pool, async (tx) => {
            const { rows } = await tx.query<{ id: string }>(
              `SELECT id FROM destinations
                WHERE origin = 'base' AND NOT (texts ? 'en' AND texts ? 'vi')
                ORDER BY base_rank DESC NULLS LAST`,
            );
            return rows.map((row) => row.id);
          });
          for (const [i, id] of ids.entries()) {
            await boss.send(
              DESTINATIONS_QUEUES.describe,
              { destination_id: id },
              {
                singletonKey: destinationsDescribeKey(id),
                startAfter: Math.floor((i * 60) / DESCRIBES_PER_MINUTE),
              },
            );
          }
        }
        return summary;
      },
    }),
    defineJob({
      queue: DESTINATIONS_QUEUES.critterMatch,
      schema: destinationsCritterMatchJobSchema.nullish(),
      handler: (data, { pool, job }) =>
        matchBaseCritters(
          pool,
          { decisions: ai?.decisions ?? null },
          { rematch: data?.rematch === true, signal: job.signal },
        ),
    }),
  ];
  if (ai !== null) {
    jobs.push(
      defineJob({
        queue: DESTINATIONS_QUEUES.describe,
        schema: destinationsDescribeJobSchema,
        singletonKey: (data) => destinationsDescribeKey(data.destination_id),
        concurrency: 2,
        handler: (data, { pool }) =>
          describeBaseDestination(
            pool,
            {
              gateway: ai.gateway,
              dailyCapMicros: Math.round(env.DESTINATIONS_DESCRIBE_DAILY_CAP_USD * 1_000_000),
            },
            data.destination_id,
          ),
      }),
    );
  }
  return jobs;
}
