import { describe, expect, it } from 'vitest';

import { shareWindow, shareWindowEnd } from '../share-window';

describe('shareWindowEnd', () => {
  it.each([
    ['UTC+8', '2026-10-18', 'Asia/Makassar', '2026-10-18T16:00:00.000Z'],
    ['UTC-10', '2026-10-18', 'Pacific/Honolulu', '2026-10-19T10:00:00.000Z'],
    ['UTC+14', '2026-10-18', 'Pacific/Kiritimati', '2026-10-18T10:00:00.000Z'],
    ['UTC+5:45', '2026-10-18', 'Asia/Kathmandu', '2026-10-18T18:15:00.000Z'],
    // Clocks fall back at 02:00 on 25 Oct: midnight is still summer time.
    ['DST end', '2026-10-24', 'Europe/Lisbon', '2026-10-24T23:00:00.000Z'],
    // Midnight on 6 Sep never happens (00:00 jumps to 01:00): the share ends at the jump.
    ['DST start at midnight', '2026-09-05', 'America/Santiago', '2026-09-06T04:00:00.000Z'],
  ])('%s: last day %s in %s ends at %s', (_label, endDate, tz, expected) => {
    expect(shareWindowEnd(endDate, tz).toISOString()).toBe(expected);
  });
});

describe('shareWindow', () => {
  const trip = {
    status: 'in_trip',
    startDate: '2026-10-15',
    endDate: '2026-10-18',
    tz: 'Asia/Makassar',
  };

  it('is open on trip days and ends at last-day midnight', () => {
    const now = new Date('2026-10-18T15:59:59Z');
    expect(shareWindow(trip, now)).toEqual({
      state: 'open',
      startsAt: new Date('2026-10-14T16:00:00Z'),
      endsAt: new Date('2026-10-18T16:00:00Z'),
    });
    expect(shareWindow(trip, new Date('2026-10-18T16:00:00Z')).state).toBe('ended');
  });

  it('has not started before the trip is in its days', () => {
    expect(
      shareWindow({ ...trip, status: 'pre_trip' }, new Date('2026-10-10T00:00:00Z')).state,
    ).toBe('not_started');
  });

  it('has ended once the trip is over, even before midnight', () => {
    expect(
      shareWindow({ ...trip, status: 'post_trip' }, new Date('2026-10-18T10:00:00Z')).state,
    ).toBe('ended');
  });

  it('is unscheduled without dates or a zone', () => {
    expect(shareWindow({ ...trip, tz: null }, new Date()).state).toBe('unscheduled');
  });
});
