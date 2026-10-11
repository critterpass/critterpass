/**
 * Builds the APNs alert body and the FCM data message for one notification row
 * (docs/api-contracts-async.md §3.1, §3.3) and validates both against
 * packages/domain/src/push-payload.ts. The `cp` block stays within 1 KB (context is dropped first);
 * an APNs payload over 4 KB has its body shortened; anything still too large is refused. Private
 * notifications (`full: false`) carry only the sender and a generic line; the extension fetches
 * the rest with its action key.
 */
import {
  apnsAlertPayloadSchema,
  cpBlockSchema,
  fcmNotificationDataSchema,
  GUIDE_COLOURS,
  jsonBytes,
  MAX_APNS_PAYLOAD_BYTES,
  MAX_CP_BYTES,
  type ApnsAlertPayload,
  type CpBlock,
  type FcmNotificationData,
  type NotificationSpec,
  type PushSender,
} from '@cp/domain';

import type { CopyRenderer } from './render';

const PRIVATE_BODY = /*i18n*/ {
  id: 'notifications.push.privateBody',
  message: 'Sent you something. Open to see it.',
};

export interface PushNotificationRow {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly sender: PushSender;
  readonly ctx: Readonly<Record<string, unknown>> | null;
  readonly deep_link: string | null;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly thread_id: string | null;
  readonly is_private: boolean;
  /** A member sender's `crew_members.colour` in this crew (`accent` or `accent/ring`). */
  readonly sender_colour?: string | null;
}

export interface BuiltPush {
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly body: string;
  readonly cp: CpBlock;
}

export type PayloadResult<T> =
  { readonly ok: true; readonly payload: T } | { readonly ok: false; readonly reason: string };

/** A member sender with their crew colour, so a sender with no photo shows an initial on it. */
function senderOf(row: PushNotificationRow): PushSender {
  const accent = row.sender_colour?.split('/')[0];
  const tone = GUIDE_COLOURS.find((colour) => colour === accent);
  return row.sender.kind === 'member' && tone !== undefined ? { ...row.sender, tone } : row.sender;
}

function cpBlock(
  row: PushNotificationRow,
  readout: boolean,
  withContext: boolean,
): CpBlock | undefined {
  const context = row.ctx === null ? undefined : { ...row.ctx };
  if (context !== undefined) delete context['subtitle'];
  const parsed = cpBlockSchema.safeParse({
    v: 1,
    nid: row.id,
    type: row.key,
    ...(row.deep_link !== null ? { deeplink: row.deep_link } : {}),
    ...(row.crew_id !== null ? { crew_id: row.crew_id } : {}),
    ...(row.trip_id !== null ? { trip_id: row.trip_id } : {}),
    sender: senderOf(row),
    ...(withContext && !row.is_private && context !== undefined && Object.keys(context).length > 0
      ? { ctx: context }
      : {}),
    full: !row.is_private,
    ...(readout ? { readout: true } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

/** The shared parts of both providers' payloads, in the recipient's locale. */
export async function buildPush(
  row: PushNotificationRow,
  options: { readonly locale: string; readonly readout: boolean; readonly renderer: CopyRenderer },
): Promise<PayloadResult<BuiltPush>> {
  let cp = cpBlock(row, options.readout, true);
  if (cp === undefined) return { ok: false, reason: 'invalid_cp_block' };
  if (jsonBytes(cp) > MAX_CP_BYTES) cp = cpBlock(row, options.readout, false);
  if (cp === undefined || jsonBytes(cp) > MAX_CP_BYTES) {
    return { ok: false, reason: 'cp_block_too_large' };
  }
  const subtitle = row.ctx?.['subtitle'];
  const body = row.is_private
    ? await options.renderer.render(options.locale, PRIVATE_BODY)
    : row.body;
  return {
    ok: true,
    payload: {
      title: row.is_private ? row.sender.name : row.title,
      subtitle: typeof subtitle === 'string' && !row.is_private ? subtitle : undefined,
      body,
      cp,
    },
  };
}

/** Shortens `text` to at most `bytes` UTF-8 bytes, ending in an ellipsis. */
function truncateUtf8(text: string, bytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).byteLength <= bytes) return text;
  const chars = [...text];
  while (chars.length > 0 && encoder.encode(`${chars.join('')}…`).byteLength > bytes) chars.pop();
  return chars.length === 0 ? '' : `${chars.join('')}…`;
}

export function apnsAlertPayload(
  push: BuiltPush,
  spec: NotificationSpec,
  threadId: string | null,
): PayloadResult<ApnsAlertPayload> {
  const build = (body: string): ApnsAlertPayload => ({
    aps: {
      alert: {
        title: push.title,
        ...(push.subtitle !== undefined ? { subtitle: push.subtitle } : {}),
        body,
      },
      ...(spec.interruption === 'passive' ? {} : { sound: 'default' }),
      category: spec.category,
      ...(threadId !== null ? { 'thread-id': threadId } : {}),
      'interruption-level': spec.interruption,
      'relevance-score': spec.relevance,
      'mutable-content': 1,
    },
    cp: push.cp,
  });
  let payload = build(push.body);
  const overflow = jsonBytes(payload) - MAX_APNS_PAYLOAD_BYTES;
  if (overflow > 0) {
    const allowed = new TextEncoder().encode(push.body).byteLength - overflow - 8;
    const shortened = truncateUtf8(push.body, Math.max(allowed, 0));
    if (shortened.length === 0) return { ok: false, reason: 'PayloadTooLarge' };
    payload = build(shortened);
    if (jsonBytes(payload) > MAX_APNS_PAYLOAD_BYTES)
      return { ok: false, reason: 'PayloadTooLarge' };
  }
  return { ok: true, payload: apnsAlertPayloadSchema.parse(payload) };
}

export function fcmData(
  push: BuiltPush,
  spec: NotificationSpec,
  threadId: string | null,
): PayloadResult<FcmNotificationData> {
  const data: FcmNotificationData = {
    v: '1',
    nid: push.cp.nid,
    type: push.cp.type,
    channel_id: spec.channel,
    title: push.title,
    body: push.body,
    ...(push.subtitle !== undefined ? { subtitle: push.subtitle } : {}),
    category: spec.category,
    ...(threadId !== null ? { thread_id: threadId } : {}),
    cp: JSON.stringify(push.cp),
  };
  return { ok: true, payload: fcmNotificationDataSchema.parse(data) };
}
