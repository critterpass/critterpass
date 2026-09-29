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

  it('parses publications by type and drops anything else', () => {
    const fixes = {
      share_id: share,
      reason: 'crew_map',
      fixes: [
        { uid, lat: 1, lng: 2, acc: 5, at: '2026-10-18T09:00:00Z', activity: 'walking', mock: 0 },
      ],
    };
    expect(parseLiveMapMessage('fixes', fixes)).toEqual({
      type: 'fixes',
      data: {
        share_id: share,
        reason: 'crew_map',
        fixes: [{ uid, lat: 1, lng: 2, acc: 5, at: '2026-10-18T09:00:00Z', activity: 'walking' }],
      },
    });
    expect(
      parseLiveMapMessage('share.paused', { uid, share_id: share, at: '2026-10-18T09:00:00Z' }),
    ).toEqual({ type: 'share.paused', data: { uid, share_id: share, at: '2026-10-18T09:00:00Z' } });
    expect(parseLiveMapMessage('mystery', {})).toBeNull();
    expect(parseLiveMapMessage('ping', 'nope')).toBeNull();
    expect(parseLiveMapMessage('toString', {})).toBeNull();
  });
});
