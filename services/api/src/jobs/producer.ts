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
  AVATAR_MODERATE_QUEUE,
  AVATAR_RENDER_QUEUE,
  BILLING_QUEUES,
  DISRUPTION_QUEUES,
  CHAT_PHOTO_THUMBNAIL_QUEUE,
  CHAT_VOICE_TRANSCODE_QUEUE,
  COUNTDOWN_RECOMPUTE_QUEUE,
  DRAFT_QUEUES,
  EXPLORE_QUEUES,
  GUIDE_QUEUES,
  INBOX_FANOUT_QUEUE,
  ACCOUNT_QUEUES,
  LA_QUEUES,
  WIDGET_QUEUES,
  notificationKeysForEvent,
  notifyRouteSingletonKey,
  NOTIFY_ROUTE_QUEUE,
  OG_RENDER_QUEUE,
  MONEY_QUEUES,
  BOOKINGS_QUEUES,
  PLAN_QUEUES,
  SETUP_QUEUES,
  SUPPLIER_QUEUES,
  SAFETY_QUEUES,
  TRIP_DAY_QUEUES,
  PROPOSAL_QUEUES,
  type NotifyRouteJob,
  CRITTER_QUEUES,
  QUEST_QUEUES,
  RECAP_QUEUES,
  ALBUM_QUEUES,
  PLANNING_QUEUES,
  TRIP_PLACES_REFRESH_QUEUE,
  queueSpec,
} from '@cp/domain';
import type pg from 'pg';
import { PgBoss } from 'pg-boss';
import type { Logger } from 'pino';

import { CONTENT_PUBLISH_QUEUE } from '../admin/content/commands';
import { enqueueCountdownRecompute } from '../commands/home';
import { enqueueGuideMention } from '../commands/guide/mention';
import { enqueueInboxFanout } from '../commands/inbox';
import { queueSetupRecomputes } from '../commands/setup/membership-hook';
import {
  onDemandIngestHook,
  PLACES_INGEST_QUEUE,
  PLACES_PICK_QUEUE,
  PLACES_PROFILE_QUEUES,
} from '../places/on-demand-ingest';

/** Queues api commands send to: created here if the worker hasn't yet, so any deploy order works. */
export const PRODUCER_QUEUES: readonly string[] = [
  NOTIFY_ROUTE_QUEUE,
  CONTENT_PUBLISH_QUEUE,
  AVATAR_MODERATE_QUEUE,
  AVATAR_RENDER_QUEUE,
  CHAT_PHOTO_THUMBNAIL_QUEUE,
  CHAT_VOICE_TRANSCODE_QUEUE,
  OG_RENDER_QUEUE,
  INBOX_FANOUT_QUEUE,
  COUNTDOWN_RECOMPUTE_QUEUE,
  ...Object.values(SETUP_QUEUES),
  ...Object.values(DRAFT_QUEUES),
  ...Object.values(MONEY_QUEUES),
  ...Object.values(BOOKINGS_QUEUES),
  ...Object.values(BILLING_QUEUES),
  ...Object.values(PLAN_QUEUES),
  ...Object.values(GUIDE_QUEUES),
  ...Object.values(TRIP_DAY_QUEUES),
  ...Object.values(EXPLORE_QUEUES),
  ...Object.values(PROPOSAL_QUEUES),
  ...Object.values(CRITTER_QUEUES),
  ...Object.values(QUEST_QUEUES),
  ...Object.values(RECAP_QUEUES),
  ...Object.values(ALBUM_QUEUES),
  LA_QUEUES.orchestrate,
  WIDGET_QUEUES.refresh,
  ...Object.values(SAFETY_QUEUES),
  ACCOUNT_QUEUES.purge,
  ACCOUNT_QUEUES.exportBuild,
  'cost.recompute',
  SUPPLIER_QUEUES.replyParse,
  DISRUPTION_QUEUES.react,
  PLACES_INGEST_QUEUE,
  PLACES_PICK_QUEUE,
  ...PLACES_PROFILE_QUEUES,
  TRIP_PLACES_REFRESH_QUEUE,
  PLANNING_QUEUES.legs,
  PLANNING_QUEUES.check,
  // Copying a crew plan starts the placing job.
  PLANNING_QUEUES.placeIdeas,
];

/**
 * Creates each missing producer queue with its catalogue policy (pg-boss fixes a policy at
 * creation, so a wrong one here outlives every later boot); the worker's boot brings the rest of
 * its options in line.
 */
export async function createProducerQueues(boss: Pick<PgBoss, 'getQueue' | 'createQueue'>) {
  for (const queue of PRODUCER_QUEUES) {
    if ((await boss.getQueue(queue)) === null) {
      await boss.createQueue(queue, { policy: queueSpec(queue).policy });
    }
  }
}

export interface StartJobProducerOptions {
  /** A direct (non-PgBouncer) connection: pg-boss takes advisory locks while it starts. */
  readonly connectionString: string;
  /** pg-boss's own pool; enqueueing runs on the caller's transaction, so 1 is enough (default 1). */
  readonly max?: number;
  readonly logger: Pick<Logger, 'error'>;
  /** Start attempts, 2 s apart, before giving up (default 30). */
  readonly startAttempts?: number;
}

const START_RETRY_MS = 2000;

/**
 * Starts pg-boss in the `pgboss` schema as app_system (installing or upgrading it if the worker has
 * not yet), makes sure the queues the api sends to exist (the worker brings their options in line
 * with its catalogue at its own start), and registers it as this process's producer.
 */
export async function startJobProducer(options: StartJobProducerOptions): Promise<PgBoss> {
  const attempts = options.startAttempts ?? 30;
  for (let attempt = 1; ; attempt += 1) {
    const boss = new PgBoss({
      connectionString: options.connectionString,
      schema: 'pgboss',
      createSchema: false,
      options: '-c role=app_system',
      application_name: 'cp-api-jobs',
      max: options.max ?? 1,
      supervise: false,
      schedule: false,
    });
    boss.on('error', (error) => options.logger.error({ err: error }, 'pg-boss producer error'));
    try {
      await boss.start();
    } catch (error) {
      // The database may still be coming up when the api boots; keep trying for a while.
      await boss.stop({ graceful: false }).catch(() => undefined);
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS));
      continue;
    }
    await createProducerQueues(boss);
    registerJobProducer(boss);
    return boss;
  }
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
  onEventAppended(enqueueInboxFanout);
  onEventAppended(enqueueCountdownRecompute);
  onEventAppended(queueSetupRecomputes);
  onEventAppended(enqueueGuideMention);
  // A pitch or a trip in a destination with few places queues that destination's ingest; one
  // with places but nothing recommended yet queues its picks.
  onEventAppended(onDemandIngestHook);
}
