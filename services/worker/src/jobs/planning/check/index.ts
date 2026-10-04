/**
 * The plan check in the worker: the job that keeps a trip's issues and its ideas' fits current,
 * the hourly sweep (06:00 trip time and catch-up), and the hook that queues it on plan changes.
 * Deterministic: nothing here imports the AI gateway.
 */
import { onEventAppended } from '@cp/db';
import {
  DEFAULT_QUEUE_SPEC,
  PLANNING_QUEUES,
  planCheckJobSchema,
  planningQueueSpecs,
} from '@cp/domain';

import { defineJob, type AnyJobDefinition } from '../../../boss';
import { planCheckEventHook } from './hooks';
import { runPlanCheck } from './run';
import { planCheckSweepJob } from './sweep';

export { planCheckEventHook, queuePlanCheck } from './hooks';
export { runPlanCheck, type PlanCheckOutcome } from './run';
export { sweepPlanChecks, PLAN_CHECK_SWEEP_QUEUE } from './sweep';

export function planCheckJob(): AnyJobDefinition {
  return defineJob({
    queue: PLANNING_QUEUES.check,
    spec: planningQueueSpecs(DEFAULT_QUEUE_SPEC)[PLANNING_QUEUES.check],
    schema: planCheckJobSchema,
    singletonKey: (data) => data.trip_id,
    async handler(data, { pool, logger }) {
      const outcome = await runPlanCheck(pool, data);
      logger.info({ trip_id: data.trip_id, trigger: data.trigger, ...outcome }, 'plan checked');
      return { ...outcome };
    },
  });
}

let hooked = false;

export function planCheckJobs(): readonly AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(planCheckEventHook);
  }
  return [planCheckJob(), planCheckSweepJob()];
}
