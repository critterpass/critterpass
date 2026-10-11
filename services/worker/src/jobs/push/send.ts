/**
 * `push.send` (docs/api-contracts-async.md §2.2): delivers one notification to one device, keyed
 * `(notification_id, device_id)`. It re-reads everything (the notification may have expired, the
 * token rotated or the user turned notifications off since routing), builds and validates the
 * payload, sends through APNs (by the token's environment and the build's bundle id) or FCM, and
 * keeps tokens clean: a token the provider calls dead is retired on the spot. Transient provider
 * failures go back to pg-boss (five retries, backing off); the last one marks the notification
 * failed. Every attempt that reached a provider counts on `cp_push_total`.
 */
import { withSystem } from '@cp/db';
import {
  appBundleIdSchema,
  getNotificationSpec,
  type AppBundleId,
  type NotificationSpec,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import type { MetricsRecorder } from '../../obs/metrics';
import type { ApnsProvider } from '../../push/apns';
import type { FcmProvider } from '../../push/fcm';
import { apnsAlertPayload, buildPush, fcmData, type PushNotificationRow } from '../../push/payload';
import type { PushResult } from '../../push/providers';
import type { CopyRenderer } from '../../push/render';

export const pushSendDataSchema = z.object({ notification_id: z.uuid(), device_id: z.uuid() });
export type PushSendData = z.infer<typeof pushSendDataSchema>;

export interface PushSendDeps {
  readonly apns?: ApnsProvider;
  readonly fcm?: FcmProvider;
  readonly renderer: CopyRenderer;
  /** Topic for installs that registered before reporting their bundle id. */
  readonly defaultBundleId: AppBundleId;
  readonly metrics?: Pick<MetricsRecorder, 'record'>;
  readonly now?: () => Date;
}

interface TargetRow extends PushNotificationRow {
  state: string;
  class: string;
  collapse_key: string | null;
  expires_at: Date | null;
  platform: 'ios' | 'android';
  bundle_id: string | null;
  device_locale: string;
  notif_permission: string | null;
  token_id: string | null;
  token: string | null;
  env: 'sandbox' | 'prod' | null;
  readout: boolean;
}

async function loadTarget(tx: pg.PoolClient, data: PushSendData): Promise<TargetRow | undefined> {
  const { rows } = await tx.query<TargetRow>(
    `SELECT n.id, n.key, n.title, n.body, n.sender, n.ctx, n.deep_link, n.crew_id, n.trip_id,
       n.thread_id, n.is_private, n.state, n.class, n.collapse_key, n.expires_at,
       d.platform, d.bundle_id, d.locale AS device_locale,
       d.permission_state ->> 'notif' AS notif_permission,
       t.id AS token_id, t.token, t.env,
       (SELECT m.colour FROM crew_members m
         WHERE n.sender ->> 'kind' = 'member' AND m.crew_id = n.crew_id
           AND m.user_id::text = n.sender ->> 'id') AS sender_colour,
       coalesce(p.voice_readout, false)
         AND coalesce(e.pass_plus AND (e.expires_at IS NULL OR e.expires_at > now()), false) AS readout
     FROM notifications n
     JOIN devices d ON d.id = $2 AND d.user_id = n.user_id
     LEFT JOIN LATERAL (
       SELECT id, token, env FROM push_tokens
       WHERE device_id = d.id AND invalid_at IS NULL ORDER BY updated_at DESC LIMIT 1
     ) t ON true
     LEFT JOIN notification_prefs p ON p.user_id = n.user_id
     LEFT JOIN user_entitlements e ON e.user_id = n.user_id
     WHERE n.id = $1`,
    [data.notification_id, data.device_id],
  );
  return rows[0];
}

export type PushSendOutcome =
  | { readonly outcome: 'sent' }
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'failed' | 'invalid_token'; readonly reason: string }
  | { readonly outcome: 'retry'; readonly reason: string };

async function markSent(pool: pg.Pool, id: string, now: Date): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE notifications SET state = 'sent', sent_at = coalesce(sent_at, $2), drop_reason = NULL
       WHERE id = $1 AND state IN ('queued', 'failed')`,
      [id, now],
    ),
  );
}

async function markFailed(pool: pg.Pool, id: string, reason: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      "UPDATE notifications SET state = 'failed', drop_reason = $2 WHERE id = $1 AND state = 'queued'",
      [id, reason],
    ),
  );
}

async function retireToken(pool: pg.Pool, tokenId: string, reason: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      'UPDATE push_tokens SET invalid_at = now(), invalid_reason = $2 WHERE id = $1 AND invalid_at IS NULL',
      [tokenId, reason],
    ),
  );
}

async function deliver(
  target: TargetRow & { token: string; env: 'sandbox' | 'prod' },
  spec: NotificationSpec,
  deps: PushSendDeps,
  now: Date,
): Promise<PushResult> {
  const push = await buildPush(target, {
    locale: target.device_locale,
    readout: target.readout,
    renderer: deps.renderer,
  });
  if (!push.ok) return { outcome: 'rejected', reason: push.reason };
  const remaining = Math.max(
    0,
    Math.floor(
      ((target.expires_at?.getTime() ?? now.getTime() + spec.ttlSeconds * 1000) - now.getTime()) /
        1000,
    ),
  );
  const collapse = target.collapse_key ?? undefined;
  if (target.platform === 'ios') {
    if (deps.apns === undefined) return { outcome: 'rejected', reason: 'apns_not_configured' };
    const payload = apnsAlertPayload(push.payload, spec, target.thread_id);
    if (!payload.ok) return { outcome: 'rejected', reason: payload.reason };
    const bundle = appBundleIdSchema.safeParse(target.bundle_id);
    return deps.apns.alert({
      token: target.token,
      env: target.env,
      bundleId: bundle.success ? bundle.data : deps.defaultBundleId,
      payload: payload.payload,
      priority: spec.interruption === 'passive' ? 5 : 10,
      expiresAt: Math.floor(now.getTime() / 1000) + remaining,
      ...(collapse !== undefined ? { collapseId: collapse.slice(0, 64) } : {}),
    });
  }
  if (deps.fcm === undefined) return { outcome: 'rejected', reason: 'fcm_not_configured' };
  const data = fcmData(push.payload, spec, target.thread_id);
  if (!data.ok) return { outcome: 'rejected', reason: data.reason };
  return deps.fcm.send({
    token: target.token,
    data: data.payload,
    priority: target.class === 'always' ? 'high' : 'normal',
    ttlSeconds: remaining,
    ...(collapse !== undefined ? { collapseKey: collapse } : {}),
  });
}

/** One delivery attempt; `isFinalAttempt` turns a retryable failure into a recorded one. */
export async function sendPush(
  pool: pg.Pool,
  deps: PushSendDeps,
  data: PushSendData,
  isFinalAttempt: boolean,
): Promise<PushSendOutcome> {
  const now = deps.now?.() ?? new Date();
  const target = await withSystem(pool, (tx) => loadTarget(tx, data));
  if (target === undefined) return { outcome: 'skipped', reason: 'not_found' };
  if (!['queued', 'sent', 'failed'].includes(target.state)) {
    return { outcome: 'skipped', reason: `state_${target.state}` };
  }
  if (target.expires_at !== null && target.expires_at.getTime() <= now.getTime()) {
    return { outcome: 'skipped', reason: 'expired' };
  }
  if (target.notif_permission === 'denied')
    return { outcome: 'skipped', reason: 'permission_denied' };
  if (target.token === null || target.env === null || target.token_id === null) {
    return { outcome: 'skipped', reason: 'no_token' };
  }
  const spec = getNotificationSpec(target.key);
  if (spec === undefined) return { outcome: 'skipped', reason: 'unknown_key' };

  const result = await deliver(
    { ...target, token: target.token, env: target.env },
    spec,
    deps,
    now,
  );
  const outcome = await settle(pool, target.id, target.token_id, result, now, isFinalAttempt);
  deps.metrics?.record('cp_push_total', 1, {
    provider: target.platform === 'ios' ? 'apns' : 'fcm',
    category: spec.category,
    outcome: outcome.outcome,
  });
  return outcome;
}

/** Writes down what the provider answered: sent, a dead token retired, or a failure. */
async function settle(
  pool: pg.Pool,
  notificationId: string,
  tokenId: string,
  result: PushResult,
  now: Date,
  isFinalAttempt: boolean,
): Promise<PushSendOutcome> {
  switch (result.outcome) {
    case 'sent':
      await markSent(pool, notificationId, now);
      return { outcome: 'sent' };
    case 'invalid_token':
      await retireToken(pool, tokenId, result.reason);
      await markFailed(pool, notificationId, 'invalid_token');
      return { outcome: 'invalid_token', reason: result.reason };
    case 'rejected':
      await markFailed(pool, notificationId, result.reason);
      return { outcome: 'failed', reason: result.reason };
    case 'retry':
      if (isFinalAttempt) {
        await markFailed(pool, notificationId, result.reason);
        return { outcome: 'failed', reason: result.reason };
      }
      return { outcome: 'retry', reason: result.reason };
  }
}

export class PushRetryError extends Error {
  constructor(readonly reason: string) {
    super(`push provider asked for a retry: ${reason}`);
    this.name = 'PushRetryError';
  }
}

export function pushSendJob(deps: PushSendDeps): JobDefinition<PushSendData> {
  return defineJob({
    queue: 'push.send',
    schema: pushSendDataSchema,
    singletonKey: (data) => `${data.notification_id}:${data.device_id}`,
    concurrency: 8,
    handler: async (data, ctx) => {
      const outcome = await sendPush(ctx.pool, deps, data, ctx.job.isFinalAttempt);
      if (outcome.outcome === 'retry') throw new PushRetryError(outcome.reason);
      return { ...outcome };
    },
  });
}
