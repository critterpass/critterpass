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

/**
 * Policy changes the catalogue made to queues that already exist, by queue: the policies a live
 * queue may still have. Only these are migrated; any other drift is left alone and reported.
 * Both planning queues recompute from state, so a job lost in the swap costs one late refresh.
 */
export const POLICY_MIGRATIONS: Readonly<Record<string, readonly QueuePolicy[]>> = {
  'plan.legs': ['singleton', 'exclusive'],
  'plan.check': ['singleton', 'exclusive'],
};

/**
 * pg-boss fixes a queue's policy at creation. For a listed migration the queue is recreated with
 * the new policy and its waiting jobs are sent again with their keys and start times (the new
 * policy folds duplicates). A queue with a running job keeps its old policy until a later boot
 * finds it idle, so no run in flight is cut off; a job sent between the read and the recreate is
 * lost.
 */
async function migrateQueuePolicy(
  boss: PgBoss,
  name: string,
  policy: QueuePolicy,
  options: Omit<Queue, 'name' | 'policy'>,
): Promise<boolean> {
  const stats = await boss.getQueueStats(name);
  if (stats.some((entry) => entry.activeCount > 0)) return false;
  const waiting = await boss.findJobs<object>(name, { queued: true });
  await boss.deleteQueue(name);
  await boss.createQueue(name, { policy, ...options });
  for (const job of waiting) {
    await boss.send(name, job.data, {
      ...(job.singletonKey === null ? {} : { singletonKey: job.singletonKey }),
      startAfter: job.startAfter,
    });
  }
  return true;
}

/** Creates the queue, or updates its options; false when its policy still differs. */
async function upsertQueue(
  boss: PgBoss,
  name: string,
  policy: QueuePolicy,
  options: Omit<Queue, 'name' | 'policy'>,
): Promise<boolean> {
  const existing = await boss.getQueue(name);
  if (existing === null) {
    await boss.createQueue(name, { policy, ...options });
    return true;
  }
  const migrates = POLICY_MIGRATIONS[name]?.includes(existing.policy as QueuePolicy) === true;
  if (
    existing.policy !== policy &&
    migrates &&
    (await migrateQueuePolicy(boss, name, policy, options))
  ) {
    return true;
  }
  await boss.updateQueue(name, options);
  return existing.policy === policy;
}

/**
 * Creates every queue in `names` (dead-letter queue first, since pg-boss checks it exists), or
 * brings an existing queue's options (and, for a listed migration, its policy) in line with the
 * catalogue. Returns the queues whose policy still differs from the catalogue.
 */
export async function ensureQueues(
  boss: PgBoss,
  queues: ReadonlyArray<readonly [name: string, entry: QueueSpec]>,
): Promise<string[]> {
  const deferred: string[] = [];
  for (const [name, entry] of queues) {
    if (entry.deadLetter) {
      await upsertQueue(boss, dlqName(name), 'standard', {
        retentionSeconds: DLQ_RETENTION_SECONDS,
        retryLimit: 0,
      });
    }
    if (!(await upsertQueue(boss, name, entry.policy, queueOptions(name, entry)))) {
      deferred.push(name);
    }
  }
  return deferred;
}
