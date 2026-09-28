/**
 * `defineJob` (docs/api-contracts-async.md §2.1): one typed definition per queue holding the payload
 * schema, the natural-key `singletonKey`, and the handler. The same definition enqueues (from a
 * running boss or inside a command transaction) and consumes, so a payload that the schema rejects
 * never reaches a handler, and one that could never be valid is dead-lettered instead of retried.
 */
import { sendInTx, type SendInTxOptions } from '@cp/db';
import type { JobWithMetadata, PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import type pg from 'pg';
import type { z } from 'zod';

import { jobTraceCarrier, withJobSpan } from '../obs/job-span';
import { queueSpec, type QueueName, type QueueSpec } from './queues';

export interface JobLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

/** Process-wide dependencies every handler may use. */
export interface WorkerDeps {
  readonly pool: pg.Pool;
  readonly boss: PgBoss;
  readonly logger: JobLogger;
}

export interface JobAttempt {
  readonly id: string;
  readonly queue: string;
  /** 0 on the first attempt. */
  readonly retryCount: number;
  readonly retryLimit: number;
  /** True when a failure now is terminal (dead-lettered when the queue has a DLQ). */
  readonly isFinalAttempt: boolean;
  /** Aborted when the attempt expires or the worker stops; long handlers should check it. */
  readonly signal: AbortSignal;
  /** What the previous attempt left in the job's output (step state, error), if anything. */
  readonly previousOutput: unknown;
}

export interface JobContext extends WorkerDeps {
  readonly job: JobAttempt;
}

export type JobOutput = Record<string, unknown> | undefined;

/** A failed attempt: `output` replaces the job's stored output (used by the step runner). */
export class JobAttemptError extends Error {
  constructor(
    message: string,
    readonly output: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'JobAttemptError';
  }
}

export interface JobDefinition<Data> {
  readonly queue: string;
  readonly spec: QueueSpec;
  readonly schema: z.ZodType<Data>;
  readonly singletonKey?: (data: Data) => string;
  readonly handler: (data: Data, ctx: JobContext) => Promise<JobOutput | void>;
  /** Worker processes per instance; defaults to 1. */
  readonly concurrency?: number;
  /** Idle poll interval (s); unset, a notify-enabled queue polls every 30 s and is woken by NOTIFY. */
  readonly pollingIntervalSeconds?: number;
}

export interface DefineJobInput<Schema extends z.ZodType> {
  readonly queue: QueueName | (string & {});
  /** Defaults to the catalogue entry for `queue` (./queues.ts). */
  readonly spec?: QueueSpec;
  readonly schema: Schema;
  readonly singletonKey?: (data: z.output<Schema>) => string;
  readonly handler: (data: z.output<Schema>, ctx: JobContext) => Promise<JobOutput | void>;
  readonly concurrency?: number;
  readonly pollingIntervalSeconds?: number;
}

export function defineJob<Schema extends z.ZodType>(
  input: DefineJobInput<Schema>,
): JobDefinition<z.output<Schema>> {
  const spec = input.spec ?? queueSpec(input.queue);
  // pg-boss only dedupes on singletonKey under a keyed policy; on `standard` the key is ignored.
  if (input.singletonKey !== undefined && spec.policy === 'standard') {
    throw new Error(`queue ${input.queue} has a singletonKey but the standard policy ignores it`);
  }
  return {
    ...input,
    spec,
    schema: input.schema as unknown as z.ZodType<z.output<Schema>>,
  };
}

/** Any definition, whatever its payload type (registries hold these). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler parameter variance
export type AnyJobDefinition = JobDefinition<any>;

function sendOptions<Data>(
  def: JobDefinition<Data>,
  data: Data,
  options: SendInTxOptions,
): SendInTxOptions {
  const key = def.singletonKey?.(data);
  return key === undefined ? options : { singletonKey: key, ...options };
}

function payload<Data>(def: JobDefinition<Data>, data: Data): object {
  const parsed = def.schema.parse(data);
  return parsed ?? {};
}

/** Enqueues through the running boss (outside any command transaction). */
export function enqueue<Data>(
  boss: Pick<PgBoss, 'send'>,
  def: JobDefinition<Data>,
  data: Data,
  options: SendOptions = {},
): Promise<string | null> {
  return boss.send(def.queue, payload(def, data), sendOptions(def, data, options));
}

/** Enqueues inside `tx`: the job exists if and only if `tx` commits. */
export function enqueueInTx<Data>(
  tx: pg.PoolClient,
  def: JobDefinition<Data>,
  data: Data,
  options: SendInTxOptions = {},
): Promise<string | null> {
  return sendInTx(tx, def.queue, payload(def, data), sendOptions(def, data, options));
}

export type JobFailureReport = (failure: {
  readonly queue: string;
  readonly jobId: string;
  readonly attempts: number;
  readonly deadLettered: boolean;
  readonly error: unknown;
}) => void;

export interface AttemptResult {
  readonly id: string;
  readonly status: 'completed' | 'failed' | 'deadletter';
  readonly output?: object;
}

function errorOutput(error: unknown): Record<string, unknown> {
  if (error instanceof JobAttemptError) return error.output;
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: String(error) };
}

/** Runs one attempt of `job` through `def`, never throwing: the outcome is the settle instruction. */
export async function runAttempt<Data>(
  def: JobDefinition<Data>,
  job: JobWithMetadata<unknown>,
  deps: WorkerDeps,
  report: JobFailureReport,
): Promise<AttemptResult> {
  const parsed = def.schema.safeParse(job.data ?? undefined);
  if (!parsed.success) {
    report({
      queue: def.queue,
      jobId: job.id,
      attempts: job.retryCount + 1,
      deadLettered: def.spec.deadLetter,
      error: parsed.error,
    });
    return { id: job.id, status: 'deadletter', output: { message: 'payload failed validation' } };
  }
  const attempt: JobAttempt = {
    id: job.id,
    queue: def.queue,
    retryCount: job.retryCount,
    retryLimit: job.retryLimit,
    isFinalAttempt: job.retryCount >= job.retryLimit,
    signal: job.signal,
    previousOutput: job.output ?? undefined,
  };
  try {
    const output = await withJobSpan(
      { queue: def.queue, attempt: job.retryCount + 1 },
      jobTraceCarrier(job.data),
      () => def.handler(parsed.data, { ...deps, job: attempt }),
    );
    return { id: job.id, status: 'completed', ...(output ? { output } : {}) };
  } catch (error) {
    if (attempt.isFinalAttempt) {
      report({
        queue: def.queue,
        jobId: job.id,
        attempts: job.retryCount + 1,
        deadLettered: def.spec.deadLetter,
        error,
      });
    } else {
      deps.logger.warn(
        { queue: def.queue, job_id: job.id, attempt: job.retryCount + 1, err: error },
        'job attempt failed, will retry',
      );
    }
    return { id: job.id, status: 'failed', output: errorOutput(error) };
  }
}

/** Starts consuming `def.queue` on `boss`; resolves once the worker is registered. */
export function workJob<Data>(
  boss: PgBoss,
  def: JobDefinition<Data>,
  deps: WorkerDeps,
  report: JobFailureReport,
): Promise<string> {
  const options = {
    batchSize: 1,
    includeMetadata: true,
    perJobResults: true,
    localConcurrency: def.concurrency ?? 1,
    pollingIntervalSeconds: def.pollingIntervalSeconds ?? 2,
    ...(def.pollingIntervalSeconds === undefined
      ? {}
      : { notifyPollingIntervalSeconds: def.pollingIntervalSeconds }),
  } as const satisfies WorkOptions;
  return boss.work<unknown, unknown, typeof options>(def.queue, options, async (jobs) =>
    Promise.all(jobs.map((job) => runAttempt(def, job, deps, report))),
  );
}
