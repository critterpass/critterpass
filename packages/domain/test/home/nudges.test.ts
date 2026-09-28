import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ENGAGEMENT_HOUR,
  engagementHour,
  inQuietHours,
  nudgeAvailableAt,
  nudgeRelayText,
  nudgeSendTime,
  toLocalWallTime,
} from '../../src';

// A pinned clock: 2026-09-29 10:00 in Ho Chi Minh City (03:00 UTC).
const NOW = new Date('2026-09-29T03:00:00Z');
const DAY = 86_400_000;

describe('engagementHour', () => {
  it('picks the most opened hour of the last 14 days', () => {
    const recent = new Date(NOW.getTime() - 2 * DAY);
    expect(
      engagementHour(
        [
          { hourLocal: 21, opens: 6, updatedAt: recent },
          { hourLocal: 8, opens: 4, updatedAt: recent },
          { hourLocal: 13, opens: 40, updatedAt: new Date(NOW.getTime() - 20 * DAY) },
        ],
        NOW,
      ),
    ).toBe(21);
  });

  it('breaks ties toward the hour used most recently and falls back to 19:00', () => {
    expect(
      engagementHour(
        [
          { hourLocal: 7, opens: 3, updatedAt: new Date(NOW.getTime() - 3 * DAY) },
          { hourLocal: 22, opens: 3, updatedAt: new Date(NOW.getTime() - DAY) },
        ],
        NOW,
      ),
    ).toBe(22);
    expect(engagementHour([], NOW)).toBe(DEFAULT_ENGAGEMENT_HOUR);
  });
});

describe('nudgeSendTime', () => {
  it('sends at the next engagement hour in the target zone', () => {
    const today = nudgeSendTime({ now: NOW, tz: 'Asia/Ho_Chi_Minh', hour: 21, quiet: null });
    expect(today.local).toBe('2026-09-29T21:00');
    expect(today.at.toISOString()).toBe('2026-09-29T14:00:00.000Z');
    const tomorrow = nudgeSendTime({ now: NOW, tz: 'Asia/Ho_Chi_Minh', hour: 8, quiet: null });
    expect(tomorrow.local).toBe('2026-09-30T08:00');
  });

  it('never lands in quiet hours, including hours that wrap midnight', () => {
    const quiet = { from: '22:00', to: '07:00' };
    expect(inQuietHours(23 * 60, quiet)).toBe(true);
    expect(inQuietHours(6 * 60, quiet)).toBe(true);
    expect(inQuietHours(21 * 60, quiet)).toBe(false);
    const late = nudgeSendTime({ now: NOW, tz: 'Asia/Ho_Chi_Minh', hour: 23, quiet });
    expect(late.local).toBe('2026-09-30T07:00');
  });

  it('moves to the next day when the target already has two nudges that day', () => {
    const at = nudgeSendTime({
      now: NOW,
      tz: 'Asia/Ho_Chi_Minh',
      hour: 21,
      quiet: null,
      fullDates: new Set(['2026-09-29']),
    });
    expect(at.local).toBe('2026-09-30T21:00');
  });

  it('keeps the wall-clock hour across a DST change in the target zone', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const at = nudgeSendTime({ now, tz: 'Europe/Lisbon', hour: 9, quiet: null });
    expect(at.local).toBe('2026-10-25T09:00');
    expect(toLocalWallTime(at.at, 'Europe/Lisbon').time).toBe('09:00:00');
    expect(at.at.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });
});

describe('nudge rules', () => {
  it('lets a pair nudge again 24 hours after the last one', () => {
    const last = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    expect(nudgeAvailableAt(last, NOW)?.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(nudgeAvailableAt(new Date(NOW.getTime() - DAY), NOW)).toBeNull();
    expect(nudgeAvailableAt(null, NOW)).toBeNull();
  });

  it('writes relay text that names the sender and carries the link', () => {
    expect(
      nudgeRelayText({
        guide: 'Pon',
        sender: 'Winston',
        crew: 'The Bali Six',
        url: 'https://x/i/AB',
      }),
    ).toBe('Winston and Pon are saving you a spot in The Bali Six on CritterPass. https://x/i/AB');
  });
});
