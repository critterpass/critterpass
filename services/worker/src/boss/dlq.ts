/**
 * Dead letters (docs/api-contracts-async.md §2.1 "Retries"): a job on a queue with `deadLetter`
 * that fails its last attempt is copied by pg-boss into `<queue>.dlq`, where it stays queued, and
 * unconsumed, until an operator redrives it (admin console) or retention drops it. Nothing works
 * the DLQ itself, because a consumed dead letter could no longer be redriven; the alert fires from
 * the failing attempt instead (./define-job.ts `runAttempt` → `createFailureReporter`).
 */
import type { JobWithMetadata, PgBoss } from 'pg-boss';

import type { JobFailureReport, JobLogger } from './define-job';
import { dlqName } from './queues';

export interface DeadLetterAlert {
  readonly queue: string;
  readonly jobId: string;
  readonly attempts: number;
  readonly message: string;
}

/** Receives one call per terminal failure on a dead-lettered queue (Sentry, ops alert hook). */
export type DeadLetterAlertSink = (alert: DeadLetterAlert) => void;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Logs every terminal failure at error level and hands dead-lettered ones to `alert`. Payload data
 * is never logged: jobs carry user content.
 */
export function createFailureReporter(
  logger: JobLogger,
  alert: DeadLetterAlertSink = () => undefined,
): JobFailureReport {
  return ({ queue, jobId, attempts, deadLettered, error }) => {
    const details = { queue, job_id: jobId, attempts, err: error };
    if (!deadLettered) {
      logger.error(details, 'job failed terminally');
      return;
    }
    logger.error({ ...details, dlq: dlqName(queue) }, 'job dead-lettered');
    alert({ queue, jobId, attempts, message: messageOf(error) });
  };
}

/** The dead letters waiting on `queue`'s DLQ, oldest first. */
export async function listDeadLetters(
  boss: PgBoss,
  queue: string,
): Promise<JobWithMetadata<unknown>[]> {
  const jobs = await boss.findJobs<unknown>(dlqName(queue), { queued: true });
  return jobs.sort((a, b) => a.createdOn.getTime() - b.createdOn.getTime());
}

/**
 * Moves dead letters back onto `queue` as fresh jobs (new id, retry count 0): every one waiting, or
 * only `jobIds` (their ids in the DLQ). Resolves to how many moved.
 */
export function redrive(boss: PgBoss, queue: string, jobIds?: readonly string[]): Promise<number> {
  return boss.redrive(dlqName(queue), {
    destination: queue,
    ...(jobIds === undefined ? {} : { ids: [...jobIds] }),
  });
}
