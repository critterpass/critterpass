/**
 * The queue catalogue (docs/api-contracts-async.md §2.2, §2.3): every pg-boss queue, its retry,
 * expiry and dead-letter policy, and the cron that feeds it when it is a periodic job. Queues are
 * created (or their options updated) from this table at boot; later features append rows.
 */
import type { PgBoss, Queue, QueuePolicy } from 'pg-boss';

export const DLQ_SUFFIX = '.dlq';

/** The dead-letter queue a queue's terminally failed jobs are copied into. */
export function dlqName(queue: string): string {
  return `${queue}${DLQ_SUFFIX}`;
}

export interface QueueCron {
  /** Five-field cron expression. */
  readonly expr: string;
  /** IANA zone the expression is read in. */
  readonly tz: string;
}

export interface QueueSpec {
  readonly policy: QueuePolicy;
  readonly retryLimit: number;
  /** Seconds before the first retry; doubled per attempt (with jitter) when `retryBackoff`. */
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  /** How long one attempt may stay active before pg-boss fails it. */
  readonly expireInSeconds: number;
  /** Seconds a completed job is kept (pg-boss `deleteAfterSeconds`). */
  readonly keepCompletedSeconds: number;
  /** Terminal failures land in `<queue>.dlq`, alert, and wait for a redrive. */
  readonly deadLetter: boolean;
  /** Wake workers with NOTIFY on insert instead of waiting for their next poll. */
  readonly notify: boolean;
  readonly cron?: QueueCron;
}

const DAY = 86_400;

/** Default policy for event-driven queues: 3 retries, exponential from 10 s. */
export const DEFAULT_QUEUE_SPEC: QueueSpec = {
  policy: 'standard',
  retryLimit: 3,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 15 * 60,
  keepCompletedSeconds: 7 * DAY,
  deadLetter: false,
  notify: false,
};

/** Dead-lettered jobs wait this long for a redrive before pg-boss drops them. */
export const DLQ_RETENTION_SECONDS = 30 * DAY;

function spec(overrides: Partial<QueueSpec>): QueueSpec {
  return { ...DEFAULT_QUEUE_SPEC, ...overrides };
}

export const QUEUES = {
  /** One drain at a time, one queued behind it: wake storms collapse into a single follow-up run. */
  'rt.relay': spec({
    policy: 'stately',
    retryLimit: 10,
    retryDelay: 1,
    retryBackoff: false,
    expireInSeconds: 60,
    keepCompletedSeconds: 3600,
    notify: true,
  }),
  'sched.enqueue_due': spec({
    policy: 'stately',
    retryDelay: 5,
    retryBackoff: false,
    expireInSeconds: 55,
    keepCompletedSeconds: DAY,
    cron: { expr: '* * * * *', tz: 'UTC' },
  }),
  // Keyed queues (`exclusive`): one queued-or-active job per natural key, so a repeated send while
  // the first is pending folds into it; after completion the handler's own re-read keeps it a no-op.
  'notify.route': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  'push.send': spec({ policy: 'exclusive', retryLimit: 5, notify: true }),
  'roundup.build': spec({ policy: 'exclusive' }),
  'quota.release': spec({ policy: 'exclusive', retryLimit: 5, deadLetter: true }),
  'maint.purge': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '30 3 * * *', tz: 'Asia/Singapore' },
  }),
  'maint.anon_gc': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '0 4 * * *', tz: 'UTC' },
  }),
  'guide_action.execute': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  'guide_action.undo_expire': spec({ policy: 'exclusive' }),
  // Travel data (docs/api-contracts-async.md §2.3): one run at a time; a rerun inside the same
  // night is a no-op because every cell remembers when it was last asked.
  'fares.refresh': spec({
    policy: 'stately',
    retryDelay: 600,
    expireInSeconds: 2 * 60 * 60,
    cron: { expr: '0 2 * * *', tz: 'Asia/Singapore' },
  }),
  'crowds.refresh': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '0 3 * * *', tz: 'Asia/Singapore' },
  }),
  // Every 15 minutes; each forecast point decides whether it is due (3 h, 1 h, or 15 min marine).
  'weather.refresh': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  }),
  // Every 15 minutes; the handler reads the feeds hourly, or every tick while a trip is under way.
  'hazards.refresh': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  }),
  'fx.refresh': spec({
    policy: 'stately',
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '15 * * * *', tz: 'UTC' },
  }),
  // Daily; the handler works on Mondays and during blossom/foliage windows only.
  'season.ingest': spec({
    policy: 'stately',
    expireInSeconds: 30 * 60,
    cron: { expr: '0 4 * * *', tz: 'Asia/Singapore' },
  }),
  // Monthly: web research proposes the month three months ahead's dated events for review.
  'season.research': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 30 * 60,
    cron: { expr: '0 5 1 * *', tz: 'Asia/Singapore' },
  }),
  'ops.backup': spec({
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 300,
    expireInSeconds: 3 * 60 * 60,
    deadLetter: true,
    cron: { expr: '0 20 * * *', tz: 'UTC' },
  }),
} as const satisfies Record<string, QueueSpec>;

export type QueueName = keyof typeof QUEUES;

/** The catalogue entry for `name`; throws for a queue the catalogue does not know. */
export function queueSpec(name: string): QueueSpec {
  const entry: QueueSpec | undefined = (QUEUES as Record<string, QueueSpec>)[name];
  if (entry === undefined) throw new Error(`queue ${name} is not in the queue catalogue`);
  return entry;
}

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
