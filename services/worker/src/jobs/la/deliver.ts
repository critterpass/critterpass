/**
 * Phase two of an orchestrator run: the pushes, outside any transaction. Each planned send goes
 * out through APNs (per-activity token, push-to-start token, or the object's broadcast channel,
 * created on first use) or FCM for Android Live Updates, and comes back as an outcome the
 * recording phase applies to the rows.
 */
import {
  laApnsPayload,
  laFcmData,
  type AppBundleId,
  type LaAlert,
  type LaEvent,
  type LaKind,
  type LaPriority,
} from '@cp/domain';

import type { ApnsEnv, ApnsProvider } from '../../push/apns';
import type { FcmProvider, FcmSend } from '../../push/fcm';
import { laSurfaceMessage, type AndroidSurface } from '../../push/fcm-surfaces';
import type { ApnsChannelManager } from '../../push/la-channels';
import type { PushResult } from '../../push/providers';

export interface LaTransports {
  readonly apns?: ApnsProvider;
  readonly fcm?: FcmProvider;
  readonly channels?: ApnsChannelManager;
}

interface Common {
  readonly event: LaEvent;
  readonly contentState: Record<string, unknown>;
  readonly priority: LaPriority;
  readonly staleAt?: Date;
  readonly dismissAt?: Date;
  readonly relevance: number;
  readonly alert?: LaAlert;
}

/** One planned push. `rowId` is the device_activities row it concerns (none for a broadcast). */
export type LaSend =
  | (Common & {
      readonly via: 'token';
      readonly rowId: string;
      readonly token: string;
      readonly env: ApnsEnv;
      readonly bundleId: AppBundleId;
    })
  | (Common & {
      readonly via: 'start';
      readonly rowId: string;
      readonly token: string;
      readonly env: ApnsEnv;
      readonly bundleId: AppBundleId;
      readonly attributesType: string;
      readonly attributes: Record<string, unknown>;
      readonly alert: LaAlert;
      /** Subscribe the new activity to the object's channel (created now if needed). */
      readonly channel: boolean;
    })
  | (Common & {
      readonly via: 'broadcast';
      readonly channelId: string;
      readonly env: ApnsEnv;
      readonly bundleId: AppBundleId;
    })
  | (Common & {
      readonly via: 'fcm';
      readonly rowId: string;
      readonly token: string;
      readonly kind: LaKind;
      readonly refId: string;
      /** The object's attributes: the Live Update's progress is drawn from them on every step. */
      readonly attributes?: Record<string, unknown>;
      /** How this member's phone shows the object; absent on an end planned without the object. */
      readonly surface?: Exclude<AndroidSurface, 'none'>;
    });

export interface LaSendOutcome {
  readonly send: LaSend;
  readonly result: PushResult;
  /** The APNs channel the start subscribed to (created by this run or reused). */
  readonly channelId?: string;
}

/** Channels already known per `env:bundle`, filled in as this run creates them. */
export type ChannelBook = Map<string, string>;

export const channelKey = (env: ApnsEnv, bundleId: string) => `${env}:${bundleId}`;

const NOT_CONFIGURED: PushResult = { outcome: 'rejected', reason: 'apns_not_configured' };

function apnsPayload(send: LaSend, channelId?: string): Record<string, unknown> {
  return laApnsPayload({
    event: send.event,
    contentState: send.contentState,
    timestamp: new Date(),
    ...(send.staleAt === undefined ? {} : { staleAt: send.staleAt }),
    ...(send.dismissAt === undefined ? {} : { dismissAt: send.dismissAt }),
    relevance: send.relevance,
    ...(send.alert === undefined ? {} : { alert: send.alert }),
    ...(send.via === 'start'
      ? {
          start: {
            attributesType: send.attributesType,
            attributes: send.attributes,
            ...(channelId === undefined ? {} : { inputPushChannel: channelId }),
          },
        }
      : {}),
  });
}

async function channelFor(
  transports: LaTransports,
  book: ChannelBook,
  env: ApnsEnv,
  bundleId: AppBundleId,
): Promise<string | undefined> {
  const key = channelKey(env, bundleId);
  const known = book.get(key);
  if (known !== undefined || transports.channels === undefined) return known;
  const created = await transports.channels.create(env, bundleId);
  if (!created.ok) return undefined;
  book.set(key, created.channelId);
  return created.channelId;
}

const FCM_TTL_SECONDS = 3600;

/**
 * The FCM message for one Android step, or null when it cannot fit in a data message. A step
 * planned with the object in hand carries the surface, its channel and the progress spec; the
 * attributes travel on `start` only (the phone keeps them). An end planned without the object
 * (evicted, switched off) is the bare frame, which is all the phone needs to clear it.
 */
export function laFcmMessage(send: Extract<LaSend, { via: 'fcm' }>, now: Date): FcmSend | null {
  const collapseKey = `la:${send.kind}:${send.refId}`;
  if (send.surface === undefined) {
    return {
      token: send.token,
      data: laFcmData(send.kind, send.event, send.refId, send.contentState, send.attributes),
      priority: 'high',
      ttlSeconds: FCM_TTL_SECONDS,
      collapseKey,
    };
  }
  const message = laSurfaceMessage(
    {
      kind: send.kind,
      op: send.event,
      refId: send.refId,
      contentState: send.contentState,
      attributes: send.attributes ?? {},
      includeAttributes: send.event === 'start' && send.attributes !== undefined,
      now,
    },
    send.surface,
  );
  if (message === null) return null;
  return {
    token: send.token,
    data: { ...message.data },
    priority: message.priority,
    ttlSeconds: FCM_TTL_SECONDS,
    collapseKey: message.collapseKey,
  };
}

/** Sends one planned push; never throws for a provider answer. */
export async function deliverOne(
  transports: LaTransports,
  book: ChannelBook,
  send: LaSend,
): Promise<LaSendOutcome> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  if (send.via === 'fcm') {
    if (transports.fcm === undefined) {
      return { send, result: { outcome: 'rejected', reason: 'fcm_not_configured' } };
    }
    const message = laFcmMessage(send, new Date());
    if (message === null) {
      return { send, result: { outcome: 'rejected', reason: 'payload_too_large' } };
    }
    return { send, result: await transports.fcm.send(message) };
  }
  if (transports.apns === undefined) return { send, result: NOT_CONFIGURED };
  if (send.via === 'broadcast') {
    const result = await transports.apns.broadcast({
      channelId: send.channelId,
      env: send.env,
      bundleId: send.bundleId,
      payload: apnsPayload(send),
      priority: send.priority,
      expiresAt,
    });
    return { send, result };
  }
  const channelId =
    send.via === 'start' && send.channel
      ? await channelFor(transports, book, send.env, send.bundleId)
      : undefined;
  const result = await transports.apns.liveActivity({
    token: send.token,
    env: send.env,
    bundleId: send.bundleId,
    payload: apnsPayload(send, channelId),
    priority: send.priority,
    expiresAt,
  });
  return { send, result, ...(channelId === undefined ? {} : { channelId }) };
}

/** A transport that throws (socket, TLS) reads as a retryable failure for that one push. */
async function deliverSafely(
  transports: LaTransports,
  book: ChannelBook,
  send: LaSend,
): Promise<LaSendOutcome> {
  try {
    return await deliverOne(transports, book, send);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'transport_error';
    return { send, result: { outcome: 'retry', reason: reason.slice(0, 120) } };
  }
}

/** Sends every planned push, a few at a time. */
export async function deliverAll(
  transports: LaTransports,
  book: ChannelBook,
  sends: readonly LaSend[],
): Promise<LaSendOutcome[]> {
  const outcomes: LaSendOutcome[] = [];
  // Starts first, one by one: the first start of a shared object creates its channel.
  for (const send of sends.filter((s) => s.via === 'start')) {
    outcomes.push(await deliverSafely(transports, book, send));
  }
  const rest = sends.filter((s) => s.via !== 'start');
  for (let i = 0; i < rest.length; i += 8) {
    const batch = rest.slice(i, i + 8);
    outcomes.push(
      ...(await Promise.all(batch.map((send) => deliverSafely(transports, book, send)))),
    );
  }
  return outcomes;
}
