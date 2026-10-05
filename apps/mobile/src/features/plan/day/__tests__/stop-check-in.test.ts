/**
 * "I'm here" then "Done" on a stop of today: one visit, opened and then closed, and only stops of
 * the trip's own today offer it.
 */
import { describe, expect, it } from '@jest/globals';

import { checkInState, nextCheckIn, parseCheckIn } from '../stop-check-in';
import { isStopOfToday } from '../stop-day-actions';

const id = () => 'visit-1';

describe('checking in at a stop', () => {
  it('opens a visit on arriving and closes the same one when done', () => {
    const here = nextCheckIn(null, new Date('2026-10-05T07:05:00Z'), id);
    expect(here).toEqual({
      visitId: 'visit-1',
      arrivedAt: '2026-10-05T07:05:00.000Z',
      leftAt: null,
    });
    expect(checkInState(here)).toBe('here');
    const done = nextCheckIn(here, new Date('2026-10-05T08:00:00Z'), () => 'other');
    expect(done).toEqual({ ...here, leftAt: '2026-10-05T08:00:00.000Z' });
    expect(checkInState(done)).toBe('done');
  });

  it('never leaves before arriving, whatever the phone’s clock did', () => {
    const here = nextCheckIn(null, new Date('2026-10-05T07:05:00Z'), id);
    const done = nextCheckIn(here, new Date('2026-10-05T07:00:00Z'), id);
    expect(done.leftAt).toBe(here.arrivedAt);
  });

  it('reads what the phone kept, and anything else as not checked in', () => {
    expect(checkInState(parseCheckIn(undefined))).toBe('ahead');
    expect(parseCheckIn('not json')).toBeNull();
    expect(parseCheckIn('{"visitId":1}')).toBeNull();
    expect(parseCheckIn('{"visitId":"v","arrivedAt":"2026-10-05T07:05:00.000Z"}')).toEqual({
      visitId: 'v',
      arrivedAt: '2026-10-05T07:05:00.000Z',
      leftAt: null,
    });
  });

  it('counts a stop as today’s by the trip’s own time zone', () => {
    const tz = 'Asia/Ho_Chi_Minh';
    // 18:30 UTC on 4 Oct is 01:30 on 5 Oct in Đà Nẵng.
    const night = new Date('2026-10-04T18:30:00Z');
    expect(isStopOfToday({ start: 600 }, '2026-10-05', tz, night)).toBe(true);
    expect(isStopOfToday({ start: 600 }, '2026-10-04', tz, night)).toBe(false);
    expect(isStopOfToday({ start: null }, '2026-10-05', tz, night)).toBe(false);
    expect(isStopOfToday({ start: 600 }, null, tz, night)).toBe(false);
  });
});
