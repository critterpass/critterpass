/**
 * `notify.route` (docs/api-contracts-async.md §2.2). A domain event with registered notifications
 * enqueues one job per (event, key) in the transaction that appended it; that job resolves the
 * audience and fans out one job per recipient, keyed `(event, key, uid)`. The recipient job writes
 * exactly one `notifications` row per dedupe key (a replayed event finds it and stops), books the
 * day's ledger under a row lock, and either enqueues `push.send` per reachable device, rolls the
 * item into the evening roundup, or records why it was dropped.
 */
import { sendInTx, withSystem } from '@cp/db';
import {
  getNotificationSpec,
  renderCollapseKey,
  resolveNotificationClass,
  type NotificationClass,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import type { CopyRenderer } from '../../push/render';
import { loadRecipient } from './audience';
import { decide, localClock, type Decision } from './policy';
import {
  dedupeKeyFor,
  getRegistration,
  registrationsForEvent,
  type NotificationRegistration,
  type NotificationRewriter,
  type RoutedEvent,
} from './register';
import { bookLedger, lockLedger, pushTargets, writeNotification } from './store';

export const NOTIFY_ROUTE_QUEUE = 'notify.route';
export const PUSH_SEND_QUEUE = 'push.send';

export const notifyRouteDataSchema = z.object({
  event_id: z.uuid(),
  key: z.string().min(1),
  /** Absent on the fan-out job; present on each recipient's job. */
  uid: z.uuid().optional(),
});
export type NotifyRouteData = z.infer<typeof notifyRouteDataSchema>;

const routeSingletonKey = (data: NotifyRouteData): string =>
  `${data.event_id}:${data.key}:${data.uid ?? '*'}`;

export function enqueueNotifyRoute(
  tx: pg.PoolClient,
  data: NotifyRouteData,
): Promise<string | null> {
  return sendInTx(tx, NOTIFY_ROUTE_QUEUE, notifyRouteDataSchema.parse(data), {
    singletonKey: routeSingletonKey(data),
  });
}

/** `onEventAppended` hook: one routing job per registered notification of the event's type. */
export async function routeEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  for (const registration of registrationsForEvent(event.type)) {
    await enqueueNotifyRoute(tx, { event_id: event.id, key: registration.key });
  }
}

export function enqueuePushSend(
  tx: pg.PoolClient,
  data: { readonly notification_id: string; readonly device_id: string },
): Promise<string | null> {
  return sendInTx(tx, PUSH_SEND_QUEUE, data, {
    singletonKey: `${data.notification_id}:${data.device_id}`,
  });
}

interface EventRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  crew_id: string | null;
  trip_id: string | null;
  actor_id: string | null;
  occurred_at: Date;
}

async function loadEvent(tx: pg.PoolClient, id: string): Promise<RoutedEvent | undefined> {
  const { rows } = await tx.query<EventRow>(
    'SELECT id, type, payload, crew_id, trip_id, actor_id, occurred_at FROM app.domain_event_for_routing($1)',
    [id],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    crewId: row.crew_id,
    tripId: row.trip_id,
    actorId: row.actor_id,
    occurredAt: row.occurred_at,
  };
}

export interface NotifyRouteDeps {
  readonly renderer: CopyRenderer;
  readonly rewriter?: NotificationRewriter;
  readonly now?: () => Date;
}

export type RouteOutcome =
  | { readonly outcome: 'fanned_out'; readonly recipients: number }
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'duplicate' }
  | {
      readonly outcome: 'routed';
      readonly notificationId: string;
      readonly class: NotificationClass;
      readonly decision: Decision;
    };

async function routeRecipient(
  tx: pg.PoolClient,
  deps: NotifyRouteDeps,
  event: RoutedEvent,
  registration: NotificationRegistration,
  uid: string,
): Promise<RouteOutcome> {
  const spec = getNotificationSpec(registration.key);
  if (spec === undefined) return { outcome: 'skipped', reason: 'unknown_key' };
  const dedupeKey = dedupeKeyFor(registration, event, uid);
  const seen = await tx.query(
    'SELECT 1 FROM notifications WHERE user_id = $1 AND dedupe_key = $2',
    [uid, dedupeKey],
  );
  if (seen.rowCount) return { outcome: 'duplicate' };

  const now = deps.now?.() ?? new Date();
  const recipient = await loadRecipient(tx, uid, now);
  if (recipient === undefined) return { outcome: 'skipped', reason: 'no_recipient' };
  const composed = await registration.compose(tx, event, uid);
  if (composed === null) return { outcome: 'skipped', reason: 'nothing_to_send' };

  const cls = resolveNotificationClass(spec, composed.classContext);
  const clock = localClock(now, recipient.tz);
  const ledger = await lockLedger(tx, uid, clock.date);
  const expiresAt =
    composed.expiresAt ?? new Date(event.occurredAt.getTime() + spec.ttlSeconds * 1000);
  const prefEnabled =
    (spec.pref === undefined || recipient.prefs.gates[spec.pref]) &&
    recipient.prefs.perCategory[spec.category] !== false;
  let decision = decide({
    class: cls,
    paywall: spec.paywall,
    onlyIfBackgrounded: spec.onlyIfBackgrounded,
    prefEnabled,
    expired: expiresAt.getTime() <= now.getTime(),
    inForeground: recipient.inForeground,
    localMinutes: clock.minutes,
    quiet: recipient.prefs.quiet,
    budgetPerDay: recipient.prefs.budgetPerDay,
    sentBudgeted: ledger.sentBudgeted,
    paywallSent: ledger.paywallSent,
  });
  const devices = decision.action === 'send' ? await pushTargets(tx, uid) : [];
  if (decision.action === 'send' && devices.length === 0) {
    decision = { action: 'drop', reason: 'no_push_token' };
  }

  const vars = composed.vars ?? {};
  const title = await deps.renderer.render(recipient.locale, composed.title, vars);
  let body = await deps.renderer.render(recipient.locale, composed.body, vars);
  if (deps.rewriter !== undefined && composed.sender.kind === 'guide') {
    body = await deps.rewriter({
      key: spec.key,
      templateId: composed.body.id,
      locale: recipient.locale,
      guideId: composed.sender.id,
      vars,
      text: body,
    });
  }
  const crewId = composed.crewId ?? event.crewId;
  const tripId = composed.tripId ?? event.tripId;
  const notificationId = await writeNotification(tx, {
    uid,
    event,
    spec,
    cls,
    composed,
    title,
    body,
    crewId,
    tripId,
    dedupeKey,
    localDate: clock.date,
    expiresAt,
    decision,
    collapseKey: renderCollapseKey(spec.collapse, {
      ...(crewId ? { crew_id: crewId } : {}),
      ...(tripId ? { trip_id: tripId } : {}),
      local_date: clock.date,
      ...composed.collapseVars,
    }),
  });
  if (notificationId === undefined) return { outcome: 'duplicate' };

  await bookLedger(tx, uid, clock.date, cls, spec.paywall, decision);
  for (const deviceId of devices) {
    await enqueuePushSend(tx, { notification_id: notificationId, device_id: deviceId });
  }
  return { outcome: 'routed', notificationId, class: cls, decision };
}

/** Routes one job's worth of work in one transaction (exported for direct use in tests). */
export function routeNotification(
  pool: pg.Pool,
  deps: NotifyRouteDeps,
  data: NotifyRouteData,
): Promise<RouteOutcome> {
  return withSystem(pool, async (tx) => {
    const event = await loadEvent(tx, data.event_id);
    if (event === undefined) return { outcome: 'skipped', reason: 'no_event' };
    const registration = getRegistration(event.type, data.key);
    if (registration === undefined) return { outcome: 'skipped', reason: 'no_registration' };
    if (data.uid !== undefined) return routeRecipient(tx, deps, event, registration, data.uid);

    const recipients = [...new Set(await registration.audience(tx, event))];
    for (const uid of recipients) {
      await enqueueNotifyRoute(tx, { event_id: event.id, key: registration.key, uid });
    }
    return { outcome: 'fanned_out', recipients: recipients.length };
  });
}

export function notifyRouteJob(deps: NotifyRouteDeps): JobDefinition<NotifyRouteData> {
  return defineJob({
    queue: NOTIFY_ROUTE_QUEUE,
    schema: notifyRouteDataSchema,
    singletonKey: routeSingletonKey,
    concurrency: 4,
    handler: async (data, ctx) => {
      const outcome = await routeNotification(ctx.pool, deps, data);
      return { ...outcome };
    },
  });
}
