/**
 * Bulk AI work as an agent job step (quests, the notification template library, the content
 * factory). DeepSeek has no batch API, so the step runs its requests as direct gateway calls with
 * bounded concurrency (packages/ai/src/batch.ts), each billed to the job on its own `ai_usage` row
 * as it finishes. Durability comes from the job, request by request:
 *
 * - every finished request is applied once: in one transaction, under the job row's lock, the
 *   step's `onResult` runs, the request's `customId` joins the step's progress in
 *   `agent_jobs.partial` and the job's cost is rolled up from `ai_usage`;
 * - a transient provider failure fails the attempt after the requests in flight are applied; the
 *   retry rebuilds the request list and skips every `customId` already applied, so no finished
 *   request is called or applied again.
 */
import { runBatch, type BatchItemResult, type BatchRequest, type Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import type { AiRoute } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import {
  loadAgentJob,
  rollUpJobCost,
  saveAgentJob,
  TERMINAL_JOB_STATUSES,
  type AgentJobRow,
} from './agent-job-store';
import type { AgentStep, AgentStepContext } from './job-runner';

export interface BatchStepInput {
  readonly id: string;
  readonly route: AiRoute;
  readonly build: (ctx: AgentStepContext) => Promise<readonly BatchRequest[]>;
  /** Persists one result in the step's transaction; runs exactly once per `customId`. */
  readonly onResult: (
    tx: pg.PoolClient,
    result: BatchItemResult,
    job: AgentJobRow,
  ) => Promise<void>;
}

export interface BatchDeps {
  /** A gateway whose `onUsage` records `ai_usage` (every call is billed as it finishes). */
  readonly gateway: Gateway;
  /** Requests in flight at once (default 4). */
  readonly concurrency?: number;
}

/** The step's entry in `agent_jobs.partial` while it runs, and its result once done. */
const progressSchema = z.object({
  done: z.array(z.string()).default([]),
  succeeded: z.number().int().default(0),
  refused: z.number().int().default(0),
  errored: z.number().int().default(0),
});
export type BatchProgress = z.infer<typeof progressSchema>;

const EMPTY: BatchProgress = { done: [], succeeded: 0, refused: 0, errored: 0 };

function progressOf(job: AgentJobRow | undefined, step: string): BatchProgress {
  const entry = ((job?.partial ?? {}) as Record<string, unknown>)[step];
  const parsed = progressSchema.safeParse(entry ?? {});
  return parsed.success ? parsed.data : EMPTY;
}

/** Applies one result unless it already was; false once the job is no longer live. */
async function applyOnce(
  tx: pg.PoolClient,
  jobId: string,
  input: BatchStepInput,
  result: BatchItemResult,
): Promise<void> {
  const job = await loadAgentJob(tx, jobId, { lock: true });
  if (job === undefined || TERMINAL_JOB_STATUSES.has(job.status)) {
    throw new Error(`agent job ${jobId} stopped while its batch step ran`);
  }
  const progress = progressOf(job, input.id);
  if (progress.done.includes(result.customId)) return;
  await input.onResult(tx, result, job);
  const next: BatchProgress = {
    ...progress,
    done: [...progress.done, result.customId],
    [result.type]: progress[result.type] + 1,
  };
  const partial = { ...((job.partial ?? {}) as Record<string, unknown>), [input.id]: next };
  if (!(await saveAgentJob(tx, jobId, { partial }))) {
    throw new Error(`agent job ${jobId} stopped while its batch step ran`);
  }
  await rollUpJobCost(tx, jobId);
}

/** An agent job step that runs its requests as direct calls, resuming after the applied ones. */
export function batchStep(input: BatchStepInput, deps: BatchDeps): AgentStep {
  return {
    id: input.id,
    run: async (ctx) => {
      const jobId = ctx.agentJob.id;
      const requests = await input.build(ctx);
      const current = await withSystem(ctx.pool, (tx) => loadAgentJob(tx, jobId));
      const applied = new Set(progressOf(current, input.id).done);
      await runBatch(
        deps.gateway,
        input.route,
        requests.filter((request) => !applied.has(request.customId)),
        {
          ...(deps.concurrency === undefined ? {} : { concurrency: deps.concurrency }),
          context: ctx.usage,
          signal: ctx.job.signal,
          onResult: (result) => withSystem(ctx.pool, (tx) => applyOnce(tx, jobId, input, result)),
        },
      );
      const { done, ...counts } = progressOf(
        await withSystem(ctx.pool, (tx) => loadAgentJob(tx, jobId)),
        input.id,
      );
      return { requests: done.length, ...counts };
    },
  };
}
