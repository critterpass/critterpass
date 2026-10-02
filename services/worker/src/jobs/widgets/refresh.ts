/**
 * Widget refresh pushes (docs/api-contracts-async.md §2.2 `widgets.refresh`, §3.1): an event that
 * moves something a widget shows reaches the phones of the people it concerns that have a widget
 * installed, as an APNs `widgets` push or an FCM `widget.refresh` data message. The push carries
 * no content: the phone fetches `GET /v1/widgets/snapshot` when it arrives.
 *
 * Nothing is sent while `widgets.push.enabled` is off, or to an install that reports no widget.
 * Each send is booked in `widget_push_ledger` under the install's row lock before it leaves, so
 * two jobs never both spend the same window (./debounce.ts); a send that did not go out is
 * un-booked.
 */
import { sendInTx, withSystem, type KillSwitchReader } from '@cp/db';
import { WIDGET_QUEUES, widgetRefreshPriority, type AppBundleId } from '@cp/domain';
import type pg from 'pg';

import type { ApnsProvider, FcmProvider } from '../../push';
import type { PushResult } from '../../push/providers';
import { decideWidgetPush, type WidgetPushDecision } from './debounce';

export const WIDGETS_PUSH_SWITCH = 'widgets.push.enabled';
const PUSH_TTL_SECONDS = 3600;
const INSTALL_FRESH = "interval '30 days'";

export interface WidgetPushDeps {
  readonly apns?: Pick<ApnsProvider, 'widgets'>;
  readonly fcm?: Pick<FcmProvider, 'send'>;
  readonly switches: Pick<KillSwitchReader, 'isOn'>;
  readonly defaultBundleId: AppBundleId;
  readonly now?: () => Date;
}

/** `onEventAppended` hook: one refresh per event a widget shows something of. */
export async function widgetEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (widgetRefreshPriority(event.type) === null) return;
  await sendInTx(tx, WIDGET_QUEUES.refresh, { event_id: event.id }, { singletonKey: event.id });
}

interface Target {
  readonly device_id: string;
  readonly platform: 'ios' | 'android';
  readonly bundle_id: AppBundleId | null;
  readonly token_id: string | null;
  readonly token: string | null;
  readonly env: 'sandbox' | 'prod' | null;
  readonly fcm_token_id: string | null;
  readonly fcm_token: string | null;
}

const TARGET_SQL = `
  SELECT d.id AS device_id, d.platform, d.bundle_id, w.id AS token_id, w.token, w.env,
         f.id AS fcm_token_id, f.token AS fcm_token
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT id, token, env FROM widget_push_tokens
       WHERE device_id = d.id AND invalid_at IS NULL
       ORDER BY (widget_kind = 'all') DESC, updated_at DESC LIMIT 1
    ) w ON true
    LEFT JOIN LATERAL (
      SELECT id, token FROM push_tokens
       WHERE device_id = d.id AND kind = 'fcm' AND invalid_at IS NULL
       ORDER BY updated_at DESC LIMIT 1
    ) f ON true
   WHERE EXISTS (SELECT 1 FROM installed_widgets i
                  WHERE i.device_id = d.id AND i.last_seen_at > now() - ${INSTALL_FRESH})`;

/** The people an event concerns: its trip's travellers, else its crew, plus whoever it names. */
async function affectedUsers(
  tx: pg.PoolClient,
  eventId: string,
): Promise<{
  readonly priority: boolean;
  readonly userIds: string[];
} | null> {
  const { rows } = await tx.query<{
    type: string;
    payload: Record<string, unknown>;
    crew_id: string | null;
    trip_id: string | null;
  }>('SELECT type, payload, crew_id, trip_id FROM app.domain_event_for_routing($1)', [eventId]);
  const event = rows[0];
  const level = event === undefined ? null : widgetRefreshPriority(event.type);
  if (event === undefined || level === null) return null;
  const named = [event.payload['user_id'], event.payload['owner_id']].filter(
    (value): value is string => typeof value === 'string',
  );
  const users = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND rsvp <> 'out'
     UNION
     SELECT user_id FROM crew_members WHERE $1::uuid IS NULL AND crew_id = $2 AND status = 'active'
     UNION
     SELECT id FROM users WHERE id = ANY ($3::uuid[])`,
    [event.trip_id, event.crew_id, named],
  );
  return { priority: level === 'priority', userIds: users.rows.map((row) => row.user_id) };
}

async function book(
  pool: pg.Pool,
  deviceId: string,
  priority: boolean,
  now: Date,
): Promise<{ decision: WidgetPushDecision; previousRoutineAt: Date | null }> {
  const day = now.toISOString().slice(0, 10);
  return withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO widget_push_ledger (device_id, utc_date) VALUES ($1, $2)
       ON CONFLICT (device_id, utc_date) DO NOTHING`,
      [deviceId, day],
    );
    const { rows } = await tx.query<{ sent: number; last_routine_at: Date | null }>(
      `SELECT sent, last_routine_at FROM widget_push_ledger WHERE device_id = $1
        ORDER BY utc_date DESC FOR UPDATE`,
      [deviceId],
    );
    const previousRoutineAt =
      rows.map((row) => row.last_routine_at).find((at) => at !== null) ?? null;
    const decision = decideWidgetPush({
      priority,
      now,
      sentToday: rows[0]?.sent ?? 0,
      lastRoutineAt: previousRoutineAt,
    });
    if (decision.action === 'send') {
      await tx.query(
        `UPDATE widget_push_ledger
            SET sent = sent + 1, last_routine_at = CASE WHEN $3 THEN last_routine_at ELSE $4 END
          WHERE device_id = $1 AND utc_date = $2`,
        [deviceId, day, priority, now],
      );
      await tx.query(
        `DELETE FROM widget_push_ledger WHERE device_id = $1 AND utc_date < $2::date - 2`,
        [deviceId, day],
      );
    } else if (decision.action === 'defer') {
      await sendInTx(
        tx,
        WIDGET_QUEUES.push,
        { device_id: deviceId, priority: false },
        { singletonKey: deviceId, startAfter: decision.until },
      );
    }
    return { decision, previousRoutineAt };
  });
}

async function unbook(
  pool: pg.Pool,
  deviceId: string,
  priority: boolean,
  now: Date,
  previousRoutineAt: Date | null,
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE widget_push_ledger
          SET sent = greatest(sent - 1, 0),
              last_routine_at = CASE WHEN $3 THEN last_routine_at ELSE $4 END
        WHERE device_id = $1 AND utc_date = $2`,
      [deviceId, now.toISOString().slice(0, 10), priority, previousRoutineAt],
    ),
  );
}

async function transmit(
  target: Target,
  priority: boolean,
  deps: WidgetPushDeps,
  now: Date,
): Promise<PushResult | null> {
  if (target.platform === 'ios') {
    if (deps.apns === undefined || target.token === null || target.env === null) return null;
    return deps.apns.widgets({
      token: target.token,
      env: target.env,
      bundleId: target.bundle_id ?? deps.defaultBundleId,
      payload: { aps: { 'content-changed': true } },
      expiresAt: Math.floor(now.getTime() / 1000) + PUSH_TTL_SECONDS,
    });
  }
  if (deps.fcm === undefined || target.fcm_token === null) return null;
  return deps.fcm.send({
    token: target.fcm_token,
    data: { type: 'widget.refresh' },
    priority: priority ? 'high' : 'normal',
    ttlSeconds: PUSH_TTL_SECONDS,
    collapseKey: 'widget.refresh',
  });
}

async function retire(pool: pg.Pool, target: Target, reason: string): Promise<void> {
  const [table, id] =
    target.platform === 'ios'
      ? ['widget_push_tokens', target.token_id]
      : ['push_tokens', target.fcm_token_id];
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE ${table} SET invalid_at = now(), invalid_reason = $2
        WHERE id = $1 AND invalid_at IS NULL`,
      [id, reason.slice(0, 120)],
    ),
  );
}

export type DevicePushOutcome =
  'sent' | 'deferred' | 'capped' | 'no_token' | 'invalid_token' | 'rejected' | 'retry';

/** Decides, books and sends one install's push. */
export async function pushToDevice(
  pool: pg.Pool,
  deps: WidgetPushDeps,
  target: Target,
  priority: boolean,
): Promise<DevicePushOutcome> {
  const reachable =
    target.platform === 'ios'
      ? deps.apns !== undefined && target.token !== null
      : deps.fcm !== undefined && target.fcm_token !== null;
  if (!reachable) return 'no_token';
  const now = deps.now?.() ?? new Date();
  const { decision, previousRoutineAt } = await book(pool, target.device_id, priority, now);
  if (decision.action === 'defer') return 'deferred';
  if (decision.action === 'skip') return 'capped';
  const result = await transmit(target, priority, deps, now);
  if (result === null || result.outcome === 'sent') return 'sent';
  await unbook(pool, target.device_id, priority, now, previousRoutineAt);
  if (result.outcome === 'invalid_token') await retire(pool, target, result.reason);
  return result.outcome;
}

export async function loadTarget(pool: pg.Pool, deviceId: string): Promise<Target | undefined> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<Target>(`${TARGET_SQL} AND d.id = $1`, [deviceId]),
  );
  return rows[0];
}

export interface RefreshResult {
  readonly outcome: 'switched_off' | 'not_routed' | 'done';
  readonly devices: Partial<Record<DevicePushOutcome, number>>;
}

/** Runs one event's refresh: every install of the people it concerns that shows a widget. */
export async function refreshWidgets(
  pool: pg.Pool,
  deps: WidgetPushDeps,
  eventId: string,
): Promise<RefreshResult> {
  if (!(await deps.switches.isOn(WIDGETS_PUSH_SWITCH))) {
    return { outcome: 'switched_off', devices: {} };
  }
  const scope = await withSystem(pool, async (tx) => {
    const affected = await affectedUsers(tx, eventId);
    if (affected === null || affected.userIds.length === 0) return null;
    const { rows } = await tx.query<Target>(`${TARGET_SQL} AND d.user_id = ANY ($1::uuid[])`, [
      affected.userIds,
    ]);
    return { priority: affected.priority, targets: rows };
  });
  if (scope === null) return { outcome: 'not_routed', devices: {} };
  const devices: Partial<Record<DevicePushOutcome, number>> = {};
  for (const target of scope.targets) {
    const outcome = await pushToDevice(pool, deps, target, scope.priority);
    devices[outcome] = (devices[outcome] ?? 0) + 1;
    if (outcome === 'retry') {
      // The provider asked for a retry: this install gets its own job, the others are done.
      await withSystem(pool, (tx) =>
        sendInTx(
          tx,
          WIDGET_QUEUES.push,
          { device_id: target.device_id, priority: scope.priority },
          {
            singletonKey: scope.priority ? `${target.device_id}:priority` : target.device_id,
            startAfter: 30,
          },
        ),
      );
    }
  }
  return { outcome: 'done', devices };
}
