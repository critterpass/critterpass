/**
 * Message Batches as an agent job step (docs/api-contracts.md §6 "Batch"). `batchStep` submits the
 * step's requests and suspends the job; `ai.batch.poll` reads the batch until it ends, then applies
 * its results exactly once: in one transaction it records every billed result in `ai_usage` (batch
 * prices, billed to the job), hands the results to the step's `onResults` mapped by `custom_id`,
 * marks the step done, rolls the job's cost up and re-enqueues the job to run its remaining steps.
 * A repeated poll (a redelivery, a second poll of an ended batch) finds the step no longer waiting
 * and does nothing.
 */
import {
  alignSteps,
  recordUsage,
  updateStep,
  type AgentJobPayload,
  type BatchClient,
  type BatchItemResult,
  type BatchRequest,
} from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import { aiRouteSchema, type AiRoute } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, enqueue, type JobDefinition, type QueueSpec } from '../boss';
import {
  loadAgentJob,
  publishProgress,
  readAgentJob,
  rollUpJobCost,
  saveAgentJob,
  TERMINAL_JOB_STATUSES,
  type AgentJobRow,
} from './agent-job-store';
import {
  suspendStep,
  type AgentJobDefinition,
  type AgentStep,
  type AgentStepContext,
} from './job-runner';

export const AI_BATCH_POLL_QUEUE = 'ai.batch.poll';
const DEFAULT_POLL_DELAY_SECONDS = 60;

const pollPayloadSchema = z.object({
  agent_job_id: z.uuid(),
  step: z.string().min(1),
  batch_id: z.string().min(1),
  route: aiRouteSchema,
  resume: z.object({
    queue: z.string().min(1),
    data: z.object({ agent_job_id: z.uuid(), input: z.unknown() }),
  }),
});
type PollPayload = z.infer<typeof pollPayloadSchema>;

export interface BatchStepInput {
  readonly id: string;
  readonly route: AiRoute;
  readonly build: (ctx: AgentStepContext) => Promise<readonly BatchRequest[]>;
  /**
   * Persists the results in the poll's transaction; the returned summary (keep it small) becomes
   * the step's result. Results arrive in any order: match them on `customId`.
   */
  readonly onResults: (
    tx: pg.PoolClient,
    results: readonly BatchItemResult[],
    job: AgentJobRow,
  ) => Promise<unknown>;
}

export interface BatchStep extends AgentStep {
  readonly batch: BatchStepInput;
}

export interface BatchDeps {
  readonly batches: BatchClient;
  /** Seconds between polls of an unfinished batch. */
  readonly pollDelaySeconds?: number;
}

/** An agent job step that runs its requests as one Message Batch. */
export function batchStep(input: BatchStepInput, deps: BatchDeps): BatchStep {
  return {
    id: input.id,
    batch: input,
    run: async (ctx) => {
      const requests = await input.build(ctx);
      const batch = await deps.batches.submit(input.route, requests);
      return suspendStep({ batch_id: batch.id }, async (tx, resume) => {
        const poll: PollPayload = {
          agent_job_id: ctx.agentJob.id,
          step: input.id,
          batch_id: batch.id,
          route: input.route,
          resume,
        };
        await sendInTx(tx, AI_BATCH_POLL_QUEUE, pollPayloadSchema.parse(poll), {
          singletonKey: `${ctx.agentJob.id}:${input.id}`,
          startAfter: deps.pollDelaySeconds ?? DEFAULT_POLL_DELAY_SECONDS,
        });
      });
    },
  };
}

function isBatchStep(step: AgentStep): step is BatchStep {
  return 'batch' in step;
}

export interface AiBatchPollInput extends BatchDeps {
  /** Every agent job with batch steps; their `onResults` are looked up by kind and step id. */
  readonly jobs: readonly AgentJobDefinition[];
  readonly spec?: QueueSpec;
}

interface Target {
  readonly job: AgentJobDefinition;
  readonly step: BatchStep;
}

function targetsOf(jobs: readonly AgentJobDefinition[]): Map<string, Target> {
  const targets = new Map<string, Target>();
  for (const job of jobs) {
    for (const step of job.steps) {
      if (isBatchStep(step)) targets.set(`${job.kind}:${step.id}`, { job, step });
    }
  }
  return targets;
}

function isWaiting(job: AgentJobRow | undefined, target: Target, step: string): boolean {
  if (job === undefined || TERMINAL_JOB_STATUSES.has(job.status)) return false;
  const ids = target.job.steps.map((entry) => entry.id);
  return alignSteps(job.steps, ids).some(
    (entry) => entry.step === step && entry.status === 'waiting',
  );
}

async function applyResults(
  tx: pg.PoolClient,
  target: Target,
  payload: PollPayload,
  results: readonly BatchItemResult[],
): Promise<boolean> {
  const job = await loadAgentJob(tx, payload.agent_job_id, { lock: true });
  if (job === undefined || !isWaiting(job, target, payload.step)) return false;
  const inTx = <T>(fn: (client: pg.PoolClient) => Promise<T>) => fn(tx);
  for (const result of results) {
    if (result.type === 'succeeded') await recordUsage(inTx, result.record);
  }
  const summary = (await target.step.batch.onResults(tx, results, job)) ?? null;
  const ids = target.job.steps.map((entry) => entry.id);
  const steps = updateStep(alignSteps(job.steps, ids), payload.step, {
    status: 'done',
    finished_at: new Date().toISOString(),
  });
  const partial = { ...((job.partial ?? {}) as Record<string, unknown>), [payload.step]: summary };
  if (!(await saveAgentJob(tx, job.id, { steps, partial }))) return false;
  await rollUpJobCost(tx, job.id);
  await publishProgress(tx, target.job.channelFor(job), job.id, payload.step, steps);
  const resume: AgentJobPayload = payload.resume.data;
  // Its own key: the suspended attempt may still be settling under the job's original key.
  await sendInTx(tx, payload.resume.queue, resume, { singletonKey: `${job.id}:${payload.step}` });
  return true;
}

/** `ai.batch.poll`: one poll of one suspended batch step, re-enqueued until the batch ends. */
export function aiBatchPollJob(input: AiBatchPollInput): JobDefinition<PollPayload> {
  const targets = targetsOf(input.jobs);
  const delay = input.pollDelaySeconds ?? DEFAULT_POLL_DELAY_SECONDS;
  const definition: JobDefinition<PollPayload> = defineJob({
    queue: AI_BATCH_POLL_QUEUE,
    ...(input.spec === undefined ? {} : { spec: input.spec }),
    schema: pollPayloadSchema,
    singletonKey: (data) => `${data.agent_job_id}:${data.step}`,
    handler: async (payload, ctx) => {
      const job = await readAgentJob(ctx.pool, payload.agent_job_id);
      if (job === undefined) return { skipped: 'missing' };
      const target = targets.get(`${job.kind}:${payload.step}`);
      if (target === undefined)
        throw new Error(`no batch step ${payload.step} for ${job.kind} jobs`);
      if (!isWaiting(job, target, payload.step)) return { skipped: 'not waiting' };
      const batch = await input.batches.retrieve(payload.batch_id);
      if (batch.status !== 'ended') {
        await enqueue(ctx.boss, definition, payload, { startAfter: delay });
        return { polling: batch.status };
      }
      const results = await input.batches.results(payload.batch_id, payload.route, {
        userId: job.userId,
        tripId: job.tripId,
        jobId: payload.agent_job_id,
      });
      const applied = await withSystem(ctx.pool, (tx) =>
        applyResults(tx, target, payload, results),
      );
      return applied ? { applied: results.length } : { skipped: 'already applied' };
    },
  });
  return definition;
}
