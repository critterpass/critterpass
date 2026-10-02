/**
 * What the lock-screen sheet shows for each answer to `request_crew_lock_screen`: the Boost offer
 * only when the server says the trip is not boosted, a confirmation with the server's own start
 * time, and a reason (never a made-up success) for everything else.
 */
import { describe, expect, it } from '@jest/globals';

import { clockTime, phaseFor, previewDots, startsLater } from '../offer-model';

describe('lock-screen sheet phases', () => {
  it('confirms a boosted trip with the meet-up and when it reaches the lock screens', () => {
    expect(
      phaseFor({
        kind: 'applied',
        result: { meetup_id: 'm1', starts_at: '2026-10-17T08:30:00.000Z' },
      }),
    ).toEqual({ kind: 'started', meetupId: 'm1', startsAt: '2026-10-17T08:30:00.000Z' });
  });

  it('shows the offer only for the Boost gate', () => {
    expect(
      phaseFor({
        kind: 'rejected',
        code: 'ENTITLEMENT_REQUIRED',
        detail: { perk: 'boost_active', offers: ['boost'] },
      }),
    ).toEqual({ kind: 'offer' });
    expect(phaseFor({ kind: 'rejected', code: 'FORBIDDEN' })).toEqual({
      kind: 'unavailable',
      why: 'failed',
    });
  });

  it('says why when there is no meet-up, the switch is off, or the phone is offline', () => {
    expect(
      phaseFor({ kind: 'rejected', code: 'NOT_FOUND', detail: { reason: 'no_meetup' } }),
    ).toEqual({ kind: 'no_meetup' });
    expect(
      phaseFor({
        kind: 'rejected',
        code: 'STATE_INVALID',
        detail: { reason: 'switched_off', key: 'la.meet_up.enabled' },
      }),
    ).toEqual({ kind: 'unavailable', why: 'switched_off' });
    expect(phaseFor({ kind: 'unavailable' })).toEqual({ kind: 'unavailable', why: 'offline' });
    expect(phaseFor({ kind: 'queued' })).toEqual({ kind: 'unavailable', why: 'offline' });
  });

  it('never confirms an answer it cannot read', () => {
    expect(phaseFor({ kind: 'applied', result: null })).toEqual({
      kind: 'unavailable',
      why: 'failed',
    });
  });

  it('announces a time only for a start that is still ahead', () => {
    const now = new Date('2026-10-17T08:00:00Z');
    expect(startsLater('2026-10-17T08:30:00Z', now)).toBe(true);
    expect(startsLater('2026-10-17T08:00:20Z', now)).toBe(false);
  });

  it("reads the meet-up's time in the trip's zone, not the phone's", () => {
    const meetAt = new Date('2026-10-17T09:00:00Z');
    expect(clockTime(meetAt, 'en', 'Asia/Makassar')).toBe('17:00');
    expect(clockTime(meetAt, 'en', 'Asia/Tokyo')).toBe('18:00');
  });
});

describe('the preview line', () => {
  it('keeps the crew inside the line, in joining order, without two dots on one spot', () => {
    const dots = previewDots(['Dev', 'Jordan', null, 'Rin', 'Maya', 'Wen']);
    expect(dots.map((dot) => dot.joinIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(dots.every((dot) => dot.x > 0 && dot.x < 1)).toBe(true);
    expect(new Set(dots.map((dot) => `${dot.x}:${dot.row}`)).size).toBe(6);
    expect(dots[2]?.name).toBe('?');
    expect(previewDots(['Solo'])[0]?.x).toBe(0.5);
    expect(previewDots(Array.from({ length: 16 }, () => 'A'))).toHaveLength(8);
  });
});
