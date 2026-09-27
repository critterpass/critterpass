/**
 * `runSteps` (docs/api-contracts-async.md §2.1 "Progress", "Quotas"): a long job as an ordered list
 * of idempotent steps. Each finished step's result is kept in the job's output, so a retry resumes
 * at the step that failed instead of redoing the ones before it; each finished step publishes
 * `job.progress` through `rt_outbox`; when the last attempt fails, the steps that did finish are
 * compensated in reverse (e.g. releasing a reserved quota); success can emit a domain event for the
 * notification router (`notifyOnComplete`).
 *
 * AI jobs keep their step state in `agent_jobs.steps` instead; this runner covers every other job.
 */
import { emitEvent, outbox, withSystem } from '@cp/db';
import { JOB_PROGRESS_TYPE, jobProgressData, userChannel, type DomainEventInput } from '@cp/domain';
import { z } from 'zod';

import { JobAttemptError, type JobContext } from './define-job';

export interface Step {
  /** Stable across deploys: a renamed step reruns on the next retry. */
  readonly id: string;
  /** Returns a JSON-serialisable result, kept for later steps and for `compensate`. */
  readonly run: (ctx: StepContext) => Promise<unknown>;
  /** Undoes `run`'s side effect; must be idempotent (it may run again after a crash). */
  readonly compensate?: (result: unknown, ctx: StepContext) => Promise<void>;
}

export interface StepContext extends JobContext {
  /** Results of the steps finished so far, by step id. */
  readonly results: Readonly<Record<string, unknown>>;
}

export interface RunStepsOptions {
  /** Progress goes to `user:#<userId>` unless `progressChannel` names another channel. */
  readonly userId?: string;
  readonly progressChannel?: string;
  /** Built from the step results once every step is done, and appended as a domain event. */
  readonly notifyOnComplete?: (results: Readonly<Record<string, unknown>>) => DomainEventInput;
}

const stepStateSchema = z.object({
  steps: z.record(z.string(), z.object({ result: z.unknown() })),
});

export type StepState = z.infer<typeof stepStateSchema>;

function priorResults(previousOutput: unknown): Record<string, unknown> {
  const parsed = stepStateSchema.safeParse(previousOutput);
  if (!parsed.success) return {};
  return Object.fromEntries(
    Object.entries(parsed.data.steps).map(([id, entry]) => [id, entry.result ?? null]),
  );
}

function stateOf(results: Record<string, unknown>): StepState {
  return {
    steps: Object.fromEntries(Object.entries(results).map(([id, result]) => [id, { result }])),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function compensate(
  steps: readonly Step[],
  results: Record<string, unknown>,
  ctx: JobContext,
): Promise<{ compensated: string[]; compensationErrors: Record<string, string> }> {
  const compensated: string[] = [];
  const compensationErrors: Record<string, string> = {};
  for (const step of [...steps].reverse()) {
    if (!Object.hasOwn(results, step.id) || step.compensate === undefined) continue;
    try {
      await step.compensate(results[step.id], { ...ctx, results });
      compensated.push(step.id);
    } catch (error) {
      // Keep going: one failed undo must not leave the earlier steps' side effects in place.
      compensationErrors[step.id] = messageOf(error);
      ctx.logger.error(
        { queue: ctx.job.queue, job_id: ctx.job.id, step: step.id, err: error },
        'step compensation failed',
      );
    }
  }
  return { compensated, compensationErrors };
}

/**
 * Runs `steps` in order for the current attempt and returns their results (the job's output). A
 * failing step throws a `JobAttemptError` carrying the finished steps, so pg-boss stores them as
 * the job's output and the retry resumes after them.
 */
export async function runSteps(
  ctx: JobContext,
  steps: readonly Step[],
  options: RunStepsOptions = {},
): Promise<StepState> {
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) throw new Error('runSteps: step ids must be unique');
  const channel =
    options.progressChannel ??
    (options.userId === undefined ? undefined : userChannel(options.userId));
  const results = priorResults(ctx.job.previousOutput);
  for (const id of Object.keys(results)) if (!ids.has(id)) delete results[id];

  for (const [index, step] of steps.entries()) {
    if (Object.hasOwn(results, step.id)) continue;
    try {
      results[step.id] = (await step.run({ ...ctx, results })) ?? null;
    } catch (error) {
      const output: Record<string, unknown> = {
        ...stateOf(results),
        failed_step: step.id,
        message: messageOf(error),
      };
      if (ctx.job.isFinalAttempt) Object.assign(output, await compensate(steps, results, ctx));
      throw new JobAttemptError(`step ${step.id} failed: ${messageOf(error)}`, output, {
        cause: error,
      });
    }
    if (channel !== undefined) {
      const data = jobProgressData({
        jobId: ctx.job.id,
        step: step.id,
        done: index + 1,
        total: steps.length,
      });
      await withSystem(ctx.pool, (tx) => outbox(tx, channel, JOB_PROGRESS_TYPE, data));
    }
  }

  if (options.notifyOnComplete !== undefined) {
    const event = options.notifyOnComplete(results);
    await withSystem(ctx.pool, (tx) => emitEvent(tx, event));
  }
  return stateOf(results);
}
