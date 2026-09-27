/**
 * The api's send-only pg-boss (docs/api-contracts-async.md §2.1 "Enqueue"): command transactions
 * enqueue jobs through `sendInTx`, which needs a started producer registered once per process. It
 * never works jobs, supervises or schedules; the worker does all of that.
 *
 * Notification routing: every domain event appended here that triggers a notification key
 * (`NOTIFICATION_TRIGGERS` in @cp/domain) enqueues `notify.route` in the same transaction, the
 * same way the worker does for its own events, so a rolled-back command never notifies anyone and
 * a committed one always does.
 */
import { onEventAppended, registerJobProducer, sendInTx } from '@cp/db';
import {
  notificationKeysForEvent,
  notifyRouteSingletonKey,
  NOTIFY_ROUTE_QUEUE,
  type NotifyRouteJob,
} from '@cp/domain';
import type pg from 'pg';
import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';

export interface StartJobProducerOptions {
  /** A direct (non-PgBouncer) connection: pg-boss takes advisory locks while it starts. */
  readonly connectionString: string;
  readonly logger: Pick<Logger, 'error'>;
}

/**
 * Starts pg-boss in the `pgboss` schema as app_system (installing or upgrading it if the worker has
 * not yet), makes sure the queues the api sends to exist (the worker brings their options in line
 * with its catalogue at its own start), and registers it as this process's producer.
 */
export async function startJobProducer(options: StartJobProducerOptions): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: 'pgboss',
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-api-jobs',
    max: 2,
    supervise: false,
    schedule: false,
  });
  boss.on('error', (error) => options.logger.error({ err: error }, 'pg-boss producer error'));
  await boss.start();
  if ((await boss.getQueue(NOTIFY_ROUTE_QUEUE)) === null) {
    await boss.createQueue(NOTIFY_ROUTE_QUEUE, { policy: 'exclusive' });
  }
  registerJobProducer(boss);
  return boss;
}

/** Enqueues one routing job per notification key `event` triggers, inside `tx`. */
export async function enqueueNotificationRouting(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  for (const key of notificationKeysForEvent(event.type)) {
    const job: NotifyRouteJob = { event_id: event.id, key };
    await sendInTx(tx, NOTIFY_ROUTE_QUEUE, job, { singletonKey: notifyRouteSingletonKey(job) });
  }
}

/** Registers the routing hook on every domain event this process appends (once, at boot). */
export function routeNotificationsFromApiEvents(): void {
  onEventAppended(enqueueNotificationRouting);
}
