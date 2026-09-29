/**
 * Push payloads without a network: the APNs alert and FCM data shapes for a fixed notification
 * (validated against packages/domain/src/push-payload.ts), minimal-payload mode for private
 * content, the 1 KB `cp` ceiling, oversize bodies shortened and anything still too large refused,
 * and how provider answers map onto retire / retry / reject.
 */
import {
  apnsAlertPayloadSchema,
  apnsTopic,
  fcmNotificationDataSchema,
  getNotificationSpec,
  jsonBytes,
  MAX_APNS_PAYLOAD_BYTES,
  type NotificationSpec,
} from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  apnsAlertPayload,
  buildPush,
  fcmData,
  type PushNotificationRow,
} from '../src/push/payload';
import { apnsResult, fcmResult } from '../src/push/providers';
import { createCopyRenderer, resolveCatalogLocale } from '../src/push/render';

const renderer = createCopyRenderer();
const spec = (key: string): NotificationSpec => {
  const found = getNotificationSpec(key);
  if (found === undefined) throw new Error(`no spec ${key}`);
  return found;
};

const row: PushNotificationRow = {
  id: '0192f0c1-7a2b-7c3d-8e4f-a1b2c3d4e5f6',
  key: 'vote_needs_you',
  title: 'Where to in March?',
  body: 'Bali is ahead by one. Your vote settles it.',
  sender: { kind: 'guide', id: 'tokek', name: 'Tokek', avatar: 'avatars/guide-tokek@3x.png' },
  ctx: { poll_id: 'p1', options: [{ id: 'o1', label: 'Bali' }] },
  deep_link: 'critterpass://crew/c1/vote/p1',
  crew_id: '0192f0c1-0000-7000-8000-00000000c001',
  trip_id: null,
  thread_id: '0192f0c1-0000-7000-8000-00000000c001',
  is_private: false,
};

async function built(input: PushNotificationRow, readout = false) {
  const push = await buildPush(input, { locale: 'en', readout, renderer });
  if (!push.ok) throw new Error(push.reason);
  return push.payload;
}

describe('payload shapes', () => {
  it('builds the APNs alert payload', async () => {
    const payload = apnsAlertPayload(await built(row), spec('vote_needs_you'), row.thread_id);
    expect(payload.ok && apnsAlertPayloadSchema.safeParse(payload.payload).success).toBe(true);
  });

  it('builds the FCM data-only message with every value a string', async () => {
    const data = fcmData(await built(row, true), spec('vote_needs_you'), row.thread_id);
    expect(data.ok && fcmNotificationDataSchema.safeParse(data.payload).success).toBe(true);
    if (!data.ok) return;
    expect(Object.values(data.payload).every((value) => typeof value === 'string')).toBe(true);
    expect(data.payload).toMatchObject({
      v: '1',
      channel_id: 'cp_votes',
      category: 'cp.vote',
      title: row.title,
    });
    expect(JSON.parse(data.payload.cp)).toMatchObject({ nid: row.id, full: true, readout: true });
  });

  it('sends only the sender and a generic line for private content', async () => {
    const push = await built({
      ...row,
      key: 'crew_chat',
      is_private: true,
      sender: { kind: 'member', id: 'u1', name: 'Mai' },
    });
    expect(push).toMatchObject({ title: 'Mai', body: 'Sent you something. Open to see it.' });
    expect(push.cp.full).toBe(false);
    expect(push.cp.ctx).toBeUndefined();
  });

  it('keeps the cp block within 1 KB by dropping context first', async () => {
    const push = await built({ ...row, ctx: { big: 'x'.repeat(2000) } });
    expect(push.cp.ctx).toBeUndefined();
    expect(jsonBytes(push.cp)).toBeLessThanOrEqual(1024);
  });

  it('shortens an oversize body to fit 4 KB, and refuses what cannot fit', async () => {
    const long = apnsAlertPayload(
      await built({ ...row, body: 'Long day. '.repeat(600) }),
      spec('vote_needs_you'),
      null,
    );
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(jsonBytes(long.payload)).toBeLessThanOrEqual(MAX_APNS_PAYLOAD_BYTES);
      expect(long.payload.aps.alert.body.endsWith('…')).toBe(true);
    }
    const hopeless = apnsAlertPayload(
      await built({ ...row, title: 'T'.repeat(5000) }),
      spec('vote_needs_you'),
      null,
    );
    expect(hopeless).toEqual({ ok: false, reason: 'PayloadTooLarge' });
  });

  it('uses the Live Activity and widget topics of the build', () => {
    expect(apnsTopic('app.critterpass.staging', 'liveactivity')).toBe(
      'app.critterpass.staging.push-type.liveactivity',
    );
    expect(apnsTopic('app.critterpass', 'alert')).toBe('app.critterpass');
  });

  it('renders in the closest shipped locale', () => {
    expect(resolveCatalogLocale('vi-VN')).toBe('vi');
    expect(resolveCatalogLocale('zh-CN')).toBe('zh-Hans');
    expect(resolveCatalogLocale('xx')).toBe('en');
  });
});

describe('provider answers', () => {
  it('retires tokens APNs calls dead and retries its transient failures', () => {
    expect(apnsResult(200, undefined)).toEqual({ outcome: 'sent' });
    expect(apnsResult(410, 'Unregistered')).toEqual({
      outcome: 'invalid_token',
      reason: 'Unregistered',
    });
    expect(apnsResult(400, 'BadDeviceToken')).toEqual({
      outcome: 'invalid_token',
      reason: 'BadDeviceToken',
    });
    expect(apnsResult(429, 'TooManyRequests', '30')).toEqual({
      outcome: 'retry',
      reason: 'TooManyRequests',
      retryAfterS: 30,
    });
    expect(apnsResult(503, 'ServiceUnavailable')).toMatchObject({ outcome: 'retry' });
    expect(apnsResult(413, 'PayloadTooLarge')).toEqual({
      outcome: 'rejected',
      reason: 'PayloadTooLarge',
    });
  });

  it('retires tokens FCM calls unregistered and retries quota and server errors', () => {
    expect(fcmResult('messaging/registration-token-not-registered', '')).toMatchObject({
      outcome: 'invalid_token',
    });
    expect(fcmResult('messaging/message-rate-exceeded', '')).toMatchObject({ outcome: 'retry' });
    expect(fcmResult('messaging/internal-error', '')).toMatchObject({ outcome: 'retry' });
    expect(fcmResult('messaging/invalid-argument', '')).toMatchObject({ outcome: 'rejected' });
  });
});
