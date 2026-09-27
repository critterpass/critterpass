/**
 * `defineAgentJob` (docs/api-contracts-async.md §2.1 "Progress"): a multi-step AI job whose state
 * lives in its `agent_jobs` row, not in pg-boss. Every finished step's result is kept in
 * `agent_jobs.partial` and its progress in `agent_jobs.steps` (plus a `job.progress` hint), so a
 * retry on any worker resumes at the first unfinished step without repeating earlier side effects.
 * Model calls a step makes are billed to the job through `ctx.usage`, and the job's token and cost
 * totals are re-summed from `ai_usage` after every step. A step may suspend the job (a submitted
 * Message Batch): it is resumed by whoever finishes the wait (./batch-poll.ts).
 *
 * Steps must be idempotent on `ctx.idempotencyKey`: a crash after a step's side effect but before
 * its result is saved runs that step again.
 */
import {
  agentJobPayloadSchema,
  alignSteps,
  updateStep,
  type AgentJobPayload,
  type AgentJobStep,
  type UsageContext,
} from '@cp/ai';
import { emitEvent, withSystem } from '@cp/db';
import { userChannel, type AgentJobKind, type DomainEventInput } from '@cp/domain';
import type pg from 'pg';

import {
  defineJob,
  type JobContext,
  type JobDefinition,
  type QueueName,
  type QueueSpec,
} from '../boss';
import {
  publishProgress,
  readAgentJob,
  saveAgentJob,
  rollUpJobCost,
  TERMINAL_JOB_STATUSES,
  type AgentJobRow,
} from './agent-job-store';

export interface AgentStepContext extends JobContext {
  readonly agentJob: AgentJobRow;
  readonly input: unknown;
  /** Results of the steps finished so far, by step id. */
  readonly results: Readonly<Record<string, unknown>>;
  /** Pass to every gateway call so its `ai_usage` row is billed to this job. */
  readonly usage: UsageContext;
  /** `<agent_job_id>:<step id>`: stable across retries, for keying the step's side effects. */
  readonly idempotencyKey: string;
}

export interface AgentStep {
  /** Stable across deploys: a renamed step reruns. */
  readonly id: string;
  /** Returns a small JSON result (stored in the synced `agent_jobs.partial`), or a suspension. */
  readonly run: (ctx: AgentStepContext) => Promise<unknown>;
  /** Undoes `run`'s side effect when the job finally fails; must be idempotent. */
  readonly compensate?: (result: unknown, ctx: AgentStepContext) => Promise<void>;
  /** Tries within one attempt before the attempt fails (a pg-boss retry then resumes here). */
  readonly maxTries?: number;
}

const SUSPEND = Symbol('agent-step-suspend');

/** Where a suspended job is re-enqueued once its wait is over. */
export interface ResumeTarget {
  readonly queue: string;
  readonly data: AgentJobPayload;
}

export interface StepSuspension {
  readonly [SUSPEND]: true;
  /** Kept as the step's entry in `partial` while it waits (e.g. the batch id). */
  readonly partial: unknown;
  /** Runs in the transaction that marks the step `waiting` (enqueue whatever ends the wait). */
  readonly onSuspend: (tx: pg.PoolClient, resume: ResumeTarget) => Promise<void>;
}

export function suspendStep(
  partial: unknown,
  onSuspend: StepSuspension['onSuspend'],
): StepSuspension {
  return { [SUSPEND]: true, partial, onSuspend };
}

function isSuspension(value: unknown): value is StepSuspension {
  return typeof value === 'object' && value !== null && SUSPEND in value;
}

export interface DefineAgentJobInput {
  readonly kind: AgentJobKind;
  /** `ai.<kind>`; the catalogue entry decides retries and the dead-letter queue. */
  readonly queue: QueueName | (string & {});
  readonly spec?: QueueSpec;
  readonly steps: readonly AgentStep[];
  /** Defaults to the job owner's `user:#uid` (none for a job without a user). */
  readonly progressChannel?: (job: AgentJobRow) => string | undefined;
  readonly resultRef?: (results: Readonly<Record<string, unknown>>) => unknown;
  /** A domain event for the notification router (push when the client is in the background). */
  readonly notifyOnComplete?: (
    results: Readonly<Record<string, unknown>>,
    job: AgentJobRow,
  ) => DomainEventInput | undefined;
  readonly concurrency?: number;
  readonly pollingIntervalSeconds?: number;
}

export interface AgentJobDefinition extends JobDefinition<AgentJobPayload> {
  readonly kind: AgentJobKind;
  readonly steps: readonly AgentStep[];
  readonly channelFor: (job: AgentJobRow) => string | undefined;
}

const STEP_RETRY_MS = 500;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runWithTries(step: AgentStep, ctx: AgentStepContext): Promise<unknown> {
  const tries = Math.max(1, step.maxTries ?? 1);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await step.run(ctx);
    } catch (error) {
      if (attempt >= tries || ctx.job.signal.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, STEP_RETRY_MS * attempt));
    }
  }
}

function doneResults(state: readonly AgentJobStep[], partial: unknown): Record<string, unknown> {
  const stored = (partial ?? {}) as Record<string, unknown>;
  const results: Record<string, unknown> = {};
  for (const entry of state) {
    if (entry.status === 'done') results[entry.step] = stored[entry.step] ?? null;
  }
  return results;
}

async function compensateAll(
  steps: readonly AgentStep[],
  results: Record<string, unknown>,
  base: Omit<AgentStepContext, 'results' | 'idempotencyKey'>,
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const step of [...steps].reverse()) {
    if (!Object.hasOwn(results, step.id) || step.compensate === undefined) continue;
    try {
      const ctx = { ...base, results, idempotencyKey: `${base.agentJob.id}:${step.id}` };
      await step.compensate(results[step.id], ctx);
    } catch (error) {
      errors[step.id] = messageOf(error);
      base.logger.error(
        { agent_job_id: base.agentJob.id, step: step.id, err: error },
        'compensation failed',
      );
    }
  }
  return errors;
}

type RunOutcome =
  { readonly succeeded: true } | { readonly waiting: string } | { readonly skipped: string };

async function runAgentJob(
  def: DefineAgentJobInput,
  channelFor: (job: AgentJobRow) => string | undefined,
  payload: AgentJobPayload,
  ctx: JobContext,
): Promise<RunOutcome> {
  const job = await readAgentJob(ctx.pool, payload.agent_job_id);
  if (job === undefined) return { skipped: 'missing' };
  if (TERMINAL_JOB_STATUSES.has(job.status)) return { skipped: job.status };
  const id = job.id;
  const channel = channelFor(job);
  let state = alignSteps(
    job.steps,
    def.steps.map((step) => step.id),
  );
  const results = doneResults(state, job.partial);
  const base = {
    ...ctx,
    agentJob: job,
    input: payload.input,
    usage: { userId: job.userId, tripId: job.tripId, jobId: id },
  };
  const save = (patch: Parameters<typeof saveAgentJob>[2]) =>
    withSystem(ctx.pool, (tx) => saveAgentJob(tx, id, patch));
  const cancelled = { skipped: 'cancelled' } as const;

  if (!(await save({ status: 'running', steps: state, pgbossJobId: ctx.job.id }))) return cancelled;
  for (const step of def.steps) {
    const current = state.find((entry) => entry.step === step.id);
    if (current?.status === 'done') continue;
    if (current?.status === 'waiting') return { waiting: step.id };
    state = updateStep(state, step.id, {
      status: 'running',
      attempts: (current?.attempts ?? 0) + 1,
      started_at: new Date().toISOString(),
      error: null,
    });
    if (!(await save({ steps: state }))) return cancelled;

    let outcome: unknown;
    try {
      outcome = await runWithTries(step, { ...base, results, idempotencyKey: `${id}:${step.id}` });
    } catch (error) {
      state = updateStep(state, step.id, { status: 'failed', error: messageOf(error) });
      if (ctx.job.isFinalAttempt) {
        const errors = await compensateAll(def.steps, results, base);
        const partial =
          Object.keys(errors).length === 0 ? results : { ...results, compensation_errors: errors };
        await save({ status: 'failed', steps: state, partial });
      } else {
        await save({ steps: state });
      }
      throw error;
    }

    if (isSuspension(outcome)) {
      const suspension = outcome;
      state = updateStep(state, step.id, { status: 'waiting' });
      const suspended = await withSystem(ctx.pool, async (tx) => {
        const partial = { ...results, [step.id]: suspension.partial };
        if (!(await saveAgentJob(tx, id, { steps: state, partial }))) return false;
        await suspension.onSuspend(tx, { queue: def.queue, data: payload });
        return true;
      });
      return suspended ? { waiting: step.id } : cancelled;
    }

    results[step.id] = outcome ?? null;
    state = updateStep(state, step.id, { status: 'done', finished_at: new Date().toISOString() });
    const saved = await withSystem(ctx.pool, async (tx) => {
      if (!(await saveAgentJob(tx, id, { steps: state, partial: results }))) return false;
      await rollUpJobCost(tx, id);
      await publishProgress(tx, channel, id, step.id, state);
      return true;
    });
    if (!saved) return cancelled;
  }

  const finished = await withSystem(ctx.pool, async (tx) => {
    const resultRef = def.resultRef?.(results);
    if (!(await saveAgentJob(tx, id, { status: 'succeeded', resultRef }))) return false;
    await rollUpJobCost(tx, id);
    const event = def.notifyOnComplete?.(results, job);
    if (event !== undefined) await emitEvent(tx, event);
    return true;
  });
  return finished ? { succeeded: true } : cancelled;
}

export function defineAgentJob(input: DefineAgentJobInput): AgentJobDefinition {
  const ids = new Set(input.steps.map((step) => step.id));
  if (ids.size !== input.steps.length) throw new Error('defineAgentJob: step ids must be unique');
  const channelFor =
    input.progressChannel ??
    ((job: AgentJobRow) => (job.userId === null ? undefined : userChannel(job.userId)));
  const job = defineJob({
    queue: input.queue,
    ...(input.spec === undefined ? {} : { spec: input.spec }),
    schema: agentJobPayloadSchema,
    singletonKey: (data) => data.agent_job_id,
    handler: async (data, ctx) => ({ ...(await runAgentJob(input, channelFor, data, ctx)) }),
    ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
    ...(input.pollingIntervalSeconds === undefined
      ? {}
      : { pollingIntervalSeconds: input.pollingIntervalSeconds }),
  });
  return { ...job, kind: input.kind, steps: input.steps, channelFor };
}
