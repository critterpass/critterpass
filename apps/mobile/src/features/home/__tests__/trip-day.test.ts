/**
 * Home's card turns into the trip's day at the first day's midnight on the trip's own clock, not
 * when the server switches the trip's status, and stops being it after the last day.
 */
import { describe, expect, it } from '@jest/globals';

import { tripDayOf } from '../trip-day';

const trip = {
  status: 'confirmed' as const,
  startDate: '2026-10-05',
  endDate: '2026-10-07',
  tz: 'Asia/Ho_Chi_Minh',
};

describe('the trip’s day on Home', () => {
  it('starts at the first day’s midnight on the trip’s clock', () => {
    // 23:59 on the 4th in Đà Nẵng is still "next up"; a minute later it is day 1.
    expect(tripDayOf(trip, new Date('2026-10-04T16:59:00Z'))).toBeNull();
    expect(tripDayOf(trip, new Date('2026-10-04T17:00:00Z'))).toEqual({
      day: 1,
      days: 3,
      today: '2026-10-05',
    });
    expect(tripDayOf(trip, new Date('2026-10-07T10:00:00Z'))?.day).toBe(3);
    expect(tripDayOf(trip, new Date('2026-10-07T17:00:00Z'))).toBeNull();
  });

  it('needs a locked-in trip with dates', () => {
    const at = new Date('2026-10-05T03:00:00Z');
    expect(tripDayOf({ ...trip, status: 'proposed' }, at)).toBeNull();
    expect(tripDayOf({ ...trip, startDate: null }, at)).toBeNull();
    expect(tripDayOf({ ...trip, status: 'post_trip' }, at)).toBeNull();
    expect(tripDayOf({ ...trip, status: 'pre_trip' }, at)?.day).toBe(1);
  });

  it('keeps a trip the server marked under way inside its own days', () => {
    const early = tripDayOf({ ...trip, status: 'in_trip' }, new Date('2026-10-04T10:00:00Z'));
    expect(early?.day).toBe(1);
    const late = tripDayOf({ ...trip, status: 'in_trip' }, new Date('2026-10-09T10:00:00Z'));
    expect(late?.day).toBe(3);
  });
});
