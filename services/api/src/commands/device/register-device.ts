/**
 * `register_device` (docs/api-contracts.md §4.1): the app calls it on every launch, on foreground
 * (at most every 10 min as a `last_seen_at` heartbeat) and whenever its push token rotates. It
 * upserts the caller's `devices` row (keyed by the install id in the envelope's `device.id`) and the
 * device's provider token.
 *
 * Ownership moves with the install: when another uid previously registered this install (sign-out
 * then sign-in as someone else), the row moves to the caller and the previous owner's action keys
 * for it are revoked. A token already registered on some other device moves here, which detaches
 * it from that device's owner, so a push for the old uid can never reach this install again.
 */
import {
  appBundleIdSchema,
  DomainError,
  getNotificationSpec,
  isNotificationKey,
  timeZoneIdSchema,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';

export const registerDevicePayloadSchema = z.object({
  platform: z.enum(['ios', 'android']),
  /** The build's bundle / application id: picks the APNs topic and FCM app for this install. */
  bundle_id: appBundleIdSchema.optional(),
  /** Native APNs device token (hex) or FCM registration token; absent until the OS grants one. */
  push_token: z.string().min(1).max(4096).optional(),
  /** Which APNs host the token belongs to (development builds get sandbox tokens). */
  apns_env: z.enum(['sandbox', 'prod']).default('prod'),
  /** Canonicalized on parse: Apple's `Asia/Saigon` is stored as `Asia/Ho_Chi_Minh`. */
  tz: timeZoneIdSchema,
  locale: z.string().min(2).max(35),
  app_version: z.string().min(1).max(32),
  os_version: z.string().min(1).max(32).optional(),
  /** The app's state when it sent this call; the router holds "only if backgrounded" pushes. */
  foreground: z.boolean().default(false),
  /**
   * Notifications the app scheduled on the device itself (leave-by alarms, reminders), mirrored
   * into the daily ledger once each so the budget screen and roundup see everything that pinged.
   */
  local_scheduled: z
    .array(
      z.object({
        id: z.uuid(),
        key: z.string().refine(isNotificationKey, { message: 'must be a notification key' }),
        fire_at: z.iso.datetime({ offset: true }),
      }),
    )
    .max(64)
    .default([]),
  capabilities: z
    .object({
      la: z.boolean(),
      alarmkit: z.boolean(),
      widget_push: z.boolean(),
      live_updates: z.boolean(),
    })
    .partial()
    .default({}),
});
export type RegisterDevicePayload = z.infer<typeof registerDevicePayloadSchema>;

export interface RegisterDeviceResult {
  readonly device_id: string;
  /** True when this install belonged to another uid until this call. */
  readonly device_moved: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `VALIDATION` unless Postgres accepts `tz` (already canonical: see `timeZoneIdSchema`). */
async function requireKnownZone(tx: pg.PoolClient, tz: string): Promise<void> {
  const { rows } = await tx.query<{ ok: boolean }>('SELECT app.valid_tz($1) AS ok', [tz]);
  if (rows[0]?.ok !== true) throw new DomainError('VALIDATION', { reason: 'unknown_tz', tz });
}

/**
 * Runs `fn` as app_system inside the caller's transaction, restoring the caller's role after. Used
 * only for the rows this command must touch on another uid's behalf (a moved install, a moved
 * token); a failure aborts the transaction, which reverts the role switch with everything else.
 */
async function asSystem<T>(tx: pg.PoolClient, fn: () => Promise<T>): Promise<T> {
  const { rows } = await tx.query<{ role: string }>('SELECT current_user::text AS role');
  const role = rows[0]?.role;
  if (role === undefined) throw new Error('could not read current_user');
  await tx.query('SET LOCAL ROLE app_system');
  const result = await fn();
  await tx.query("SELECT set_config('role', $1, true)", [role]);
  return result;
}

async function claimInstall(tx: pg.PoolClient, deviceId: string, uid: string): Promise<boolean> {
  return asSystem(tx, async () => {
    const { rows } = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM devices WHERE id = $1 FOR UPDATE',
      [deviceId],
    );
    const previous = rows[0]?.user_id;
    if (previous === undefined || previous === uid) return false;
    await tx.query(
      `UPDATE device_action_keys SET revoked_at = now()
       WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [deviceId, previous],
    );
    await tx.query('UPDATE devices SET user_id = $2 WHERE id = $1', [deviceId, uid]);
    return true;
  });
}

async function upsertDevice(
  tx: pg.PoolClient,
  deviceId: string,
  uid: string,
  tz: string,
  payload: RegisterDevicePayload,
): Promise<void> {
  await tx.query(
    `INSERT INTO devices (id, user_id, platform, os_version, app_version, locale, tz, capabilities,
       foreground, la_enabled, bundle_id, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (id) DO UPDATE SET
       platform = EXCLUDED.platform,
       bundle_id = coalesce(EXCLUDED.bundle_id, devices.bundle_id),
       os_version = EXCLUDED.os_version,
       app_version = EXCLUDED.app_version,
       locale = EXCLUDED.locale,
       tz = EXCLUDED.tz,
       capabilities = EXCLUDED.capabilities,
       foreground = EXCLUDED.foreground,
       last_seen_at = now()`,
    [
      deviceId,
      uid,
      payload.platform,
      payload.os_version ?? null,
      payload.app_version,
      payload.locale,
      tz,
      JSON.stringify(payload.capabilities),
      payload.foreground,
      payload.capabilities.la === true,
      payload.bundle_id ?? null,
    ],
  );
}

async function upsertToken(
  tx: pg.PoolClient,
  deviceId: string,
  payload: RegisterDevicePayload & { push_token: string },
): Promise<void> {
  const kind = payload.platform === 'ios' ? 'apns_alert' : 'fcm';
  const env = payload.platform === 'ios' ? payload.apns_env : 'prod';
  await asSystem(tx, async () => {
    await tx.query(
      `INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, $2, $3, $4)
       ON CONFLICT (kind, token) DO UPDATE SET
         device_id = EXCLUDED.device_id, env = EXCLUDED.env, invalid_at = NULL, invalid_reason = NULL`,
      [deviceId, kind, payload.push_token, env],
    );
    // One live token per device and provider: the one just registered replaces any older one.
    await tx.query(
      `UPDATE push_tokens SET invalid_at = now(), invalid_reason = 'rotated'
       WHERE device_id = $1 AND kind = $2 AND token <> $3 AND invalid_at IS NULL`,
      [deviceId, kind, payload.push_token],
    );
  });
}

/**
 * Records each reported local notification once (dedupe key `local:<id>`) and books it on the
 * ledger for the local date it fires on, in the device's zone.
 */
async function mirrorLocalNotifications(
  tx: pg.PoolClient,
  uid: string,
  tz: string,
  items: RegisterDevicePayload['local_scheduled'],
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((item) => ({
    id: item.id,
    key: item.key,
    category: getNotificationSpec(item.key)?.category ?? 'cp.generic',
    fire_at: item.fire_at,
  }));
  await asSystem(tx, () =>
    tx.query(
      `WITH mirrored AS (
         INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
           dedupe_key, local_date, state, sent_at)
         SELECT $1, i.key, i.category, 'local', '{"kind":"system"}', i.key, '', '', 'local:' || i.id,
           (i.fire_at AT TIME ZONE $2)::date, 'sent', i.fire_at
         FROM jsonb_to_recordset($3::jsonb) AS i(id uuid, key text, category text, fire_at timestamptz)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING
         RETURNING local_date
       )
       INSERT INTO ping_ledger (user_id, local_date, sent_local)
       SELECT $1, local_date, count(*) FROM mirrored GROUP BY local_date
       ON CONFLICT (user_id, local_date) DO UPDATE
         SET sent_local = ping_ledger.sent_local + EXCLUDED.sent_local`,
      [uid, tz, JSON.stringify(rows)],
    ),
  );
}

export const registerDevice = defineCommand({
  name: 'register_device',
  v: 1,
  schema: registerDevicePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (_tx, _payload, ctx) => {
    if (!UUID.test(ctx.device.id)) {
      return Promise.reject(new DomainError('VALIDATION', { reason: 'device_id_not_uuid' }));
    }
    return Promise.resolve();
  },
  handle: async (tx, payload, ctx): Promise<RegisterDeviceResult> => {
    const deviceId = ctx.device.id.toLowerCase();
    const tz = payload.tz;
    await requireKnownZone(tx, tz);
    const moved = await claimInstall(tx, deviceId, ctx.uid);
    await upsertDevice(tx, deviceId, ctx.uid, tz, payload);
    await mirrorLocalNotifications(tx, ctx.uid, tz, payload.local_scheduled);
    if (payload.push_token !== undefined) {
      await upsertToken(tx, deviceId, { ...payload, push_token: payload.push_token });
    }
    return { device_id: deviceId, device_moved: moved };
  },
});
