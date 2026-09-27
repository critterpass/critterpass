import { describe, expect, it } from 'vitest';

import { periodKey, periodResetAt } from '../src/period';

describe('periodKey', () => {
  it('reports the device-local calendar date for a UTC instant', () => {
    // 07:00 UTC is already the next day in Tokyo (UTC+9) but still "yesterday evening" in Los Angeles.
    const instant = new Date('2026-06-15T07:00:00Z');
    expect(periodKey(instant, 'Asia/Tokyo')).toBe('2026-06-15');
    expect(periodKey(instant, 'America/Los_Angeles')).toBe('2026-06-15');
  });

  it('crosses midnight in the device tz even when the UTC date has not changed', () => {
    // 15:30 UTC is 00:30 the next day in Tokyo.
    const instant = new Date('2026-06-15T15:30:00Z');
    expect(periodKey(instant, 'Asia/Tokyo')).toBe('2026-06-16');
    expect(periodKey(instant, 'UTC')).toBe('2026-06-15');
  });

  it('agrees with the wall clock across a DST spring-forward transition', () => {
    // US DST starts 2026-03-08 02:00 -> 03:00 America/New_York; 06:30 UTC is 01:30 EST, still Mar 8.
    expect(periodKey(new Date('2026-03-08T06:30:00Z'), 'America/New_York')).toBe('2026-03-08');
    // 07:30 UTC is 03:30 EDT (the clock jumped), already Mar 8 still - the transition does not add a day.
    expect(periodKey(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toBe('2026-03-08');
    // Past local midnight the next day.
    expect(periodKey(new Date('2026-03-09T05:30:00Z'), 'America/New_York')).toBe('2026-03-09');
  });

  it('throws for a device tz that is not a real IANA zone', () => {
    expect(() => periodKey(new Date(), 'Not/A_Zone')).toThrow(RangeError);
    expect(() => periodKey(new Date(), 'GMT+7')).toThrow(RangeError);
  });
});

describe('periodResetAt', () => {
  it('is the next local midnight, expressed as the correct UTC instant', () => {
    // Asia/Jakarta is UTC+7 year-round (no DST): 2026-06-15T00:00 local == 2026-06-14T17:00:00Z.
    expect(periodResetAt('2026-06-14', 'Asia/Jakarta').toISOString()).toBe(
      '2026-06-14T17:00:00.000Z',
    );
  });

  it('accounts for a DST transition landing exactly on the reset day', () => {
    // America/New_York DST starts 2026-03-08 02:00 -> 03:00 EDT; by 2026-03-09T00:00 local the
    // clock has already jumped, so "next local midnight" is EDT (UTC-4) == 2026-03-09T04:00:00Z.
    expect(periodResetAt('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it("a tz change mid-day (SGT -> JST) still resets at the new tz's next local midnight", () => {
    // A user's period key was struck in Singapore (UTC+8); they land in Tokyo (UTC+9) before the
    // reset instant. resetAt is recomputed per current deviceTz at read time, not frozen at write time.
    const struckInSingapore = periodKey(new Date('2026-06-15T10:00:00Z'), 'Asia/Singapore');
    expect(struckInSingapore).toBe('2026-06-15');
    expect(periodResetAt(struckInSingapore, 'Asia/Tokyo').toISOString()).toBe(
      '2026-06-15T15:00:00.000Z',
    );
    expect(periodResetAt(struckInSingapore, 'Asia/Singapore').toISOString()).toBe(
      '2026-06-15T16:00:00.000Z',
    );
  });

  it('throws for a device tz that is not a real IANA zone', () => {
    expect(() => periodResetAt('2026-06-15', 'Fake/Place')).toThrow(RangeError);
  });
});
