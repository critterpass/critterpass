import { describe, expect, it } from 'vitest';

import {
  createMeetupPayloadSchema,
  moveMeetupPayloadSchema,
  parseLiveMapMessage,
} from '../payloads';

const uid = '0199a6f0-0000-7000-8000-000000000001';
const share = '0199a6f0-0000-7000-8000-000000000002';

describe('live map payloads', () => {
  it('needs exactly one place for a new meet-up', () => {
    const base = { trip_id: uid, at: '2026-10-18T09:00:00Z' };
    expect(createMeetupPayloadSchema.safeParse({ ...base, poi_id: uid }).success).toBe(true);
    expect(
      createMeetupPayloadSchema.safeParse({ ...base, point: { lat: 1, lng: 2, name: 'Pin' } })
        .success,
    ).toBe(true);
    expect(createMeetupPayloadSchema.safeParse(base).success).toBe(false);
  });

  it('refuses an empty move', () => {
    expect(moveMeetupPayloadSchema.safeParse({ meetup_id: uid }).success).toBe(false);
    expect(
      moveMeetupPayloadSchema.safeParse({ meetup_id: uid, at: '2026-10-18T10:00:00Z' }).success,
    ).toBe(true);
  });

  it('parses raw fixes and envelopes, and drops anything else', () => {
    expect(
      parseLiveMapMessage({
        type: 'fixes',
        share_id: share,
        reason: 'crew_map',
        fixes: [
          { uid, lat: 1, lng: 2, acc: 5, at: '2026-10-18T09:00:00Z', activity: 'walking', mock: 0 },
        ],
      }),
    ).toEqual({
      type: 'fixes',
      fixes: [{ uid, lat: 1, lng: 2, acc: 5, at: '2026-10-18T09:00:00Z', activity: 'walking' }],
    });
    expect(
      parseLiveMapMessage({
        v: 1,
        id: share,
        type: 'share.paused',
        at: '2026-10-18T09:00:00Z',
        data: { uid, share_id: share, at: '2026-10-18T09:00:00Z' },
      }),
    ).toEqual({ type: 'share.paused', data: { uid, share_id: share, at: '2026-10-18T09:00:00Z' } });
    expect(parseLiveMapMessage({ type: 'mystery', data: {} })).toBeNull();
    expect(parseLiveMapMessage('nope')).toBeNull();
  });
});
