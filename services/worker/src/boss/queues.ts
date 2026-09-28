/**
 * The worker side of the queue catalogue: queue names, retry, expiry and dead-letter policy and
 * crons live in `@cp/domain` (`jobs/catalogue.ts`, read by the api's jobs panel too); this module
 * creates the queues from it at boot and resolves a queue's spec.
 */
import {
  DEFAULT_QUEUE_SPEC,
  DLQ_RETENTION_SECONDS,
  DLQ_SUFFIX,
  dlqName,
  QUEUES,
  queueSpec,
  type QueueCron,
  type QueueName,
  type QueueSpec,
} from '@cp/domain';
import type { PgBoss, Queue, QueuePolicy } from 'pg-boss';

export {
  DEFAULT_QUEUE_SPEC,
  DLQ_RETENTION_SECONDS,
  DLQ_SUFFIX,
  dlqName,
  QUEUES,
  queueSpec,
  type QueueCron,
  type QueueName,
  type QueueSpec,
};

function queueOptions(name: string, entry: QueueSpec): Omit<Queue, 'name' | 'policy'> {
  return {
    retryLimit: entry.retryLimit,
    retryDelay: entry.retryDelay,
    retryBackoff: entry.retryBackoff,
    expireInSeconds: entry.expireInSeconds,
    deleteAfterSeconds: entry.keepCompletedSeconds,
    notify: entry.notify,
    ...(entry.deadLetter ? { deadLetter: dlqName(name) } : {}),
  };
}

async function upsertQueue(
  boss: PgBoss,
  name: string,
  policy: QueuePolicy,
  options: Omit<Queue, 'name' | 'policy'>,
): Promise<void> {
  if ((await boss.getQueue(name)) === null) {
    await boss.createQueue(name, { policy, ...options });
  } else {
    await boss.updateQueue(name, options);
  }
}

/**
 * Creates every queue in `names` (dead-letter queue first, since pg-boss checks it exists), or
 * brings an existing queue's options in line with the catalogue. A queue's policy is fixed once
 * created; changing it means a new queue name.
 */
export async function ensureQueues(
  boss: PgBoss,
  queues: ReadonlyArray<readonly [name: string, entry: QueueSpec]>,
): Promise<void> {
  for (const [name, entry] of queues) {
    if (entry.deadLetter) {
      await upsertQueue(boss, dlqName(name), 'standard', {
        retentionSeconds: DLQ_RETENTION_SECONDS,
        retryLimit: 0,
      });
    }
    await upsertQueue(boss, name, entry.policy, queueOptions(name, entry));
  }
}
