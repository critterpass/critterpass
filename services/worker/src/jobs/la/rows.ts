/**
 * The rows an orchestrator run reads: the activities live on an object, the audience's devices
 * (with whether each can show a Live Activity at all), a phone's occupied slots, and the pushes
 * that end a set of activities.
 */
import type { AppBundleId, LaKind, LaSlot } from '@cp/domain';
import type pg from 'pg';

import type { LaSend } from './deliver';

export interface LaDeviceRow {
  device_id: string;
  user_id: string;
  platform: 'ios' | 'android';
  bundle_id: AppBundleId;
  locale: string;
  /** Live Activities (iOS) or Live Updates (Android) are allowed on this phone. */
  la_on: boolean;
  la_frequent: boolean;
  start_token: string | null;
  start_env: 'sandbox' | 'prod' | null;
  fcm_token: string | null;
  /** The user dismissed this object's activity here, or a start failed in the last half hour. */
  blocked: boolean;
}

export interface LaActivityRow {
  id: string;
  device_id: string;
  user_id: string;
  kind: LaKind;
  ref_id: string;
  activity_push_token: string | null;
  token_env: 'sandbox' | 'prod' | null;
  broadcast_channel_id: string | null;
  /** The object's live broadcast channel this activity subscribed to, with its env and build. */
  apns_channel_id: string | null;
  channel_env: 'sandbox' | 'prod' | null;
  channel_bundle_id: AppBundleId | null;
  bundle_id: AppBundleId | null;
  platform: 'ios' | 'android';
  fcm_token: string | null;
}

export interface LaChannelTarget {
  readonly channelId: string;
  readonly env: 'sandbox' | 'prod';
  readonly bundleId: AppBundleId;
}

export function channelOf(row: LaActivityRow): LaChannelTarget | null {
  if (row.apns_channel_id === null || row.channel_env === null || row.channel_bundle_id === null) {
    return null;
  }
  return { channelId: row.apns_channel_id, env: row.channel_env, bundleId: row.channel_bundle_id };
}

const FCM_TOKEN = `(SELECT token FROM push_tokens WHERE device_id = d.id AND kind = 'fcm'
                     AND invalid_at IS NULL ORDER BY updated_at DESC LIMIT 1)`;

/** Activities the server believes are on screen for one object. */
export async function liveRows(
  tx: pg.PoolClient,
  kind: LaKind,
  refId: string,
): Promise<LaActivityRow[]> {
  const { rows } = await tx.query<LaActivityRow>(
    `SELECT a.id, a.device_id, a.user_id, a.kind, a.ref_id, a.activity_push_token, a.token_env,
            a.broadcast_channel_id, c.apns_channel_id, c.env AS channel_env,
            c.bundle_id AS channel_bundle_id, d.bundle_id, d.platform,
            ${FCM_TOKEN} AS fcm_token
       FROM device_activities a JOIN devices d ON d.id = a.device_id
       LEFT JOIN broadcast_channels c ON c.id = a.broadcast_channel_id AND c.deleted_at IS NULL
      WHERE a.kind = $1 AND a.ref_id = $2 AND a.state IN ('pending', 'active', 'stale')`,
    [kind, refId],
  );
  return rows;
}

/** Every recently seen device of the audience, including those with Live Activities off. */
export async function audienceDevices(
  tx: pg.PoolClient,
  kind: LaKind,
  refId: string,
  users: readonly string[],
  defaultBundleId: AppBundleId,
  now: Date,
): Promise<LaDeviceRow[]> {
  const { rows } = await tx.query<LaDeviceRow>(
    `SELECT d.id AS device_id, d.user_id, d.platform, coalesce(d.bundle_id, $4) AS bundle_id,
            d.locale, d.la_frequent, t.token AS start_token, t.env AS start_env,
            ${FCM_TOKEN} AS fcm_token,
            CASE WHEN d.platform = 'ios' THEN d.la_enabled
                 ELSE coalesce((d.capabilities ->> 'live_updates')::boolean, false) END AS la_on,
            EXISTS (SELECT 1 FROM device_activities x
                     WHERE x.device_id = d.id AND x.kind = $1 AND x.ref_id = $2
                       AND (x.state = 'dismissed' OR (x.end_reason = 'start_failed'
                            AND x.ended_at > $5::timestamptz - interval '30 minutes'))) AS blocked
       FROM devices d
       LEFT JOIN la_push_to_start_tokens t
         ON t.device_id = d.id AND t.activity_type = $1 AND t.invalid_at IS NULL
      WHERE d.user_id = ANY($3::uuid[]) AND d.last_seen_at > $5::timestamptz - interval '30 days'`,
    [kind, refId, users, defaultBundleId, now],
  );
  return rows;
}

/** The activities occupying a phone's lock screen now. */
export async function slotsOn(
  tx: pg.PoolClient,
  deviceId: string,
): Promise<(LaSlot & { id: string })[]> {
  const { rows } = await tx.query<{ id: string; kind: LaKind; ref_id: string }>(
    `SELECT id, kind, ref_id FROM device_activities
      WHERE device_id = $1 AND state IN ('pending', 'active', 'stale')`,
    [deviceId],
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, refId: row.ref_id }));
}

export async function markEnded(
  tx: pg.PoolClient,
  ids: readonly string[],
  reason: string,
  now: Date,
): Promise<void> {
  if (ids.length === 0) return;
  await tx.query(
    `UPDATE device_activities SET state = 'ended', ended_at = $2, end_reason = $3
      WHERE id = ANY($1::uuid[]) AND state IN ('pending', 'active', 'stale')`,
    [ids, now, reason],
  );
}

/**
 * The pushes that end `rows` with `final` as their last frame: FCM on Android, the object's
 * channel once for activities on it, otherwise each activity's own token. An activity with none
 * of these ends on the phone at its stale and 8-hour limits.
 */
export function endSends(
  rows: readonly LaActivityRow[],
  final: Record<string, unknown>,
  dismissAt: Date,
  relevance: number,
): LaSend[] {
  const sends: LaSend[] = [];
  const channels = new Set<string>();
  const common = {
    event: 'end' as const,
    contentState: final,
    priority: 5 as const,
    dismissAt,
    relevance,
  };
  for (const row of rows) {
    const channel = channelOf(row);
    if (row.platform === 'android') {
      if (row.fcm_token === null) continue;
      sends.push({
        ...common,
        via: 'fcm',
        rowId: row.id,
        token: row.fcm_token,
        kind: row.kind,
        refId: row.ref_id,
      });
    } else if (channel !== null) {
      if (channels.has(channel.channelId)) continue;
      channels.add(channel.channelId);
      sends.push({ ...common, via: 'broadcast', ...channel });
    } else if (
      row.activity_push_token !== null &&
      row.token_env !== null &&
      row.bundle_id !== null
    ) {
      sends.push({
        ...common,
        via: 'token',
        rowId: row.id,
        token: row.activity_push_token,
        env: row.token_env,
        bundleId: row.bundle_id,
      });
    }
  }
  return sends;
}
