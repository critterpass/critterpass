/**
 * `places.pick` (docs/api-contracts-async.md §2.3; docs/product-decisions.md D25): the machine
 * picks of one destination without a curated set (`src/places/pick/run.ts`). Queued when a trip
 * or a pitch names such a destination with no picks yet, forced when its place ingest finishes
 * (the catalogue changed) or a draft's own naming call failed, and by an operator
 * (`src/places/pick/cli.ts`). One run at a time per destination (the job is keyed by its
 * slug). The model call is system usage; while it fails the job retries, and the last attempt
 * fills from open data alone so the destination is never left with nothing to suggest.
 */
import { createGateway, recordUsage, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { withSystem } from '@cp/db';
import { PLACES_QUEUES, placesPickJobSchema, placesPickKey } from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { runPlacePick, type PlacePickDeps } from '../../places/pick/run';

export const PLACES_PICK_QUEUE = PLACES_QUEUES.pick;

export interface PlacesPickEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export interface PlacesPickJobDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
}

/** The process's gateway for the naming call, billed to the system; none without a model key. */
export function placePickDeps(env: PlacesPickEnv, deps: PlacesPickJobDeps): PlacePickDeps {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === '') return {};
  return {
    gateway: createGateway({
      apiKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
      onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
      assertRouteOn: deps.assertRouteOn,
    }),
  };
}

/** Queues a destination's pick; a run already waiting for it absorbs this one. */
export async function queuePlacePick(
  boss: Pick<PgBoss, 'send'>,
  slug: string,
  force = false,
): Promise<string | null> {
  return boss.send(
    PLACES_PICK_QUEUE,
    { destination: slug, ...(force ? { force: true } : {}) },
    { singletonKey: placesPickKey(slug) },
  );
}

export function placesPickJob(deps: PlacePickDeps): AnyJobDefinition {
  return defineJob({
    queue: PLACES_PICK_QUEUE,
    schema: placesPickJobSchema,
    async handler(data, { pool, logger, job }) {
      const report = await runPlacePick(
        pool,
        deps,
        {
          slug: data.destination,
          ...(data.force === undefined ? {} : { force: data.force }),
          requireNames: !job.isFinalAttempt,
          signal: job.signal,
        },
        logger,
      );
      return { ...report };
    },
  });
}
