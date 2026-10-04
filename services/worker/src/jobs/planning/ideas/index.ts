/**
 * Ideas in the worker: the `ideas.seed` job and the hook that queues it when a trip gets its
 * destination or a member joins in a worker transaction, and Tokek placing ideas on days.
 */
import { onEventAppended } from '@cp/db';
import {
  DEFAULT_QUEUE_SPEC,
  ideasSeedJobSchema,
  PLANNING_QUEUES,
  planningQueueSpecs,
} from '@cp/domain';

import { defineJob, type AnyJobDefinition } from '../../../boss';
import { placeIdeasJob } from './place-ideas';
import { registerPlacementPush } from './placement-push';
import { ideasSeedEventHook, ideasSeedKey, runIdeasSeed } from './seed';

export { ideasSeedEventHook, ideasSeedKey, runIdeasSeed, seedTripIdeas } from './seed';
export {
  PLACE_IDEAS_STEP_IDS,
  placeIdeasJob,
  placedStableId,
  type RoutingResult,
} from './place-ideas';

export function ideasSeedJob(): AnyJobDefinition {
  return defineJob({
    queue: PLANNING_QUEUES.ideasSeed,
    spec: planningQueueSpecs(DEFAULT_QUEUE_SPEC)[PLANNING_QUEUES.ideasSeed],
    schema: ideasSeedJobSchema,
    singletonKey: ideasSeedKey,
    async handler(data, { pool, logger }) {
      const ideas = await runIdeasSeed(pool, data);
      logger.info({ trip_id: data.trip_id, ideas: ideas.length }, 'ideas seeded');
      return { ideas: ideas.length };
    },
  });
}

let hooked = false;

export function ideasJobs(): readonly AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(ideasSeedEventHook);
    registerPlacementPush();
  }
  return [ideasSeedJob(), placeIdeasJob()];
}
