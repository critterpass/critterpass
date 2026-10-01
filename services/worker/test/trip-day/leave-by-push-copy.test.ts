/**
 * What a leave-by push says: a routed or picked-up leave-by is a time to leave; one with no trip
 * counted is a time to be there (check-in time at the departure airport for a flight), and never
 * reads "leave by".
 */
import { TRIP_DAY_PUSH } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { leaveByPushCopy, type LeaveByPushFacts } from '../../src/jobs/trip-day/leave-by-push-copy';

const TZ = 'Asia/Ho_Chi_Minh';

/** The 07:05 from Saigon: stored leave-by 04:55 (check-in two hours ahead, 10-minute buffer). */
const flight: LeaveByPushFacts = {
  title: '9G 956 · SGN → DAD',
  place_name: null,
  starts_at: new Date('2026-10-02T00:05:00Z'),
  leave_at: new Date('2026-10-01T21:55:00Z'),
  tz: TZ,
  category: 'flight',
  leg_kind: 'none',
  dep_airport: 'SGN',
};

describe('leave-by push copy', () => {
  it('tells a flight with no trip counted when to be at the airport', () => {
    expect(leaveByPushCopy(flight)).toEqual({
      alarmTitle: TRIP_DAY_PUSH.alarmTitleBeThere,
      alarmBody: TRIP_DAY_PUSH.alarmBodyBeThere,
      knockTitle: TRIP_DAY_PUSH.knockTitleBeThere,
      place: 'SGN',
      time: '05:05',
    });
  });

  it('tells any other item with no trip counted when to be at the place', () => {
    const copy = leaveByPushCopy({
      ...flight,
      title: 'Marble Mountains',
      place_name: 'Marble Mountains',
      starts_at: new Date('2026-10-02T23:00:00Z'),
      leave_at: new Date('2026-10-02T22:50:00Z'),
      category: 'activity',
      dep_airport: null,
    });
    expect(copy).toMatchObject({
      alarmTitle: TRIP_DAY_PUSH.alarmTitleBeThere,
      knockTitle: TRIP_DAY_PUSH.knockTitleBeThere,
      place: 'Marble Mountains',
      time: '06:00',
    });
  });

  it('keeps "leave by" and the stored time once a route or a pickup is counted', () => {
    for (const kind of ['route', 'pickup']) {
      expect(leaveByPushCopy({ ...flight, place_name: 'Tan Son Nhat', leg_kind: kind })).toEqual({
        alarmTitle: TRIP_DAY_PUSH.alarmTitle,
        alarmBody: TRIP_DAY_PUSH.alarmBody,
        knockTitle: TRIP_DAY_PUSH.knockTitle,
        place: 'Tan Son Nhat',
        time: '04:55',
      });
    }
  });
});
