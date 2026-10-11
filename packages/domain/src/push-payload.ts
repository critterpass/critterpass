/**
 * Push payload contracts (docs/api-contracts-async.md §3.1, §3.3): the `cp` block every
 * notification carries (at most 1 KB, read by the iOS Notification Service Extension and the
 * Android messaging service alike), the APNs alert/background bodies and the FCM data-only message.
 * The worker validates every payload against these before it leaves; the native targets decode
 * the same shapes.
 */
import { z } from 'zod';

import { GUIDE_COLOURS } from './enums/catalogue';
import { ANDROID_CHANNELS, NOTIFICATION_CATEGORIES, SENDER_KINDS } from './notifications';

/** App bundle ids (and Android application ids): production, staging and development builds. */
export const APP_BUNDLE_IDS = [
  'app.critterpass',
  'app.critterpass.staging',
  'app.critterpass.dev',
] as const;
export const appBundleIdSchema = z.enum(APP_BUNDLE_IDS);
export type AppBundleId = z.infer<typeof appBundleIdSchema>;

/** APNs topic per push type: alert/background use the bundle id itself. */
export function apnsTopic(bundleId: AppBundleId, pushType: ApnsPushType): string {
  switch (pushType) {
    case 'liveactivity':
      return `${bundleId}.push-type.liveactivity`;
    case 'widgets':
      return `${bundleId}.push-type.widgets`;
    case 'alert':
    case 'background':
      return bundleId;
  }
}

export const APNS_PUSH_TYPES = ['alert', 'background', 'liveactivity', 'widgets'] as const;
export type ApnsPushType = (typeof APNS_PUSH_TYPES)[number];

/** `cp` block ceiling (bytes of its JSON). */
export const MAX_CP_BYTES = 1024;
/** APNs payload ceiling for alert and background pushes. */
export const MAX_APNS_PAYLOAD_BYTES = 4096;
/** FCM data-message ceiling. */
export const MAX_FCM_DATA_BYTES = 4096;

export const pushSenderSchema = z.object({
  kind: z.enum(SENDER_KINDS),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  avatar: z.string().max(120).optional(),
  /** A crew member's colour, so a sender with no photo shows their initial on it. */
  tone: z.enum(GUIDE_COLOURS).optional(),
});
export type PushSender = z.infer<typeof pushSenderSchema>;

export const cpBlockSchema = z.object({
  v: z.literal(1),
  nid: z.uuid(),
  /** The catalogue key (`vote_needs_you`, `evening_roundup`, …). */
  type: z.string().min(1).max(64),
  deeplink: z.string().max(300).optional(),
  crew_id: z.uuid().optional(),
  trip_id: z.uuid().optional(),
  sender: pushSenderSchema,
  ctx: z.record(z.string(), z.unknown()).optional(),
  /** false: minimal payload, the extension fetches `GET /v1/notifications/{nid}`. */
  full: z.boolean(),
  /** Spoken read-out on arrival (Pass+ with the voice read-out preference on). */
  readout: z.boolean().optional(),
});
export type CpBlock = z.infer<typeof cpBlockSchema>;

export const apnsAlertPayloadSchema = z.object({
  aps: z.object({
    alert: z.object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
      body: z.string().min(1),
    }),
    sound: z.string().optional(),
    category: z.enum(NOTIFICATION_CATEGORIES),
    'thread-id': z.string().optional(),
    'interruption-level': z.enum(['passive', 'active', 'time-sensitive']),
    'relevance-score': z.number().min(0).max(1),
    'mutable-content': z.literal(1),
    'target-content-id': z.string().optional(),
  }),
  cp: cpBlockSchema,
});
export type ApnsAlertPayload = z.infer<typeof apnsAlertPayloadSchema>;

export const apnsBackgroundPayloadSchema = z.object({
  aps: z.object({ 'content-available': z.literal(1) }),
  cp: z.object({ type: z.literal('resync'), scope: z.string().min(1).max(64) }),
});
export type ApnsBackgroundPayload = z.infer<typeof apnsBackgroundPayloadSchema>;

/** FCM data-only message body: every value a string (`cp` is the same block, stringified). */
export const fcmNotificationDataSchema = z.object({
  v: z.literal('1'),
  nid: z.uuid(),
  type: z.string().min(1),
  channel_id: z.enum(ANDROID_CHANNELS),
  title: z.string().min(1),
  body: z.string().min(1),
  subtitle: z.string().optional(),
  category: z.enum(NOTIFICATION_CATEGORIES),
  thread_id: z.string().optional(),
  cp: z.string().refine((value) => cpBlockSchema.safeParse(JSON.parse(value)).success, {
    message: 'cp must be a stringified cp block',
  }),
});
export type FcmNotificationData = z.infer<typeof fcmNotificationDataSchema>;

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
