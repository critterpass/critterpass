import { describe, expect, it } from 'vitest';

import {
  decodeMemberStatus,
  encodeMemberStatus,
  formatDistance,
  memberStatus,
} from '../status-text';

describe('memberStatus', () => {
  it('says "on the scooter" for driving on a scooter trip', () => {
    expect(
      memberStatus({
        activity: 'automotive',
        poiName: null,
        meetupDistanceM: 2040,
        transport: 'scooter',
      }),
    ).toEqual({ key: 'on_scooter', poi: null, distanceM: 2040 });
    expect(memberStatus({ activity: 'automotive', poiName: null, meetupDistanceM: 2040 }).key).toBe(
      'driving',
    );
  });

  it('names the place someone is at or leaving', () => {
    expect(
      memberStatus({ activity: 'walking', poiName: 'Karsa Spa', meetupDistanceM: 900 }),
    ).toEqual({ key: 'leaving_place', poi: 'Karsa Spa', distanceM: 900 });
    expect(
      memberStatus({ activity: 'stationary', poiName: 'Warung Pondok', meetupDistanceM: 900 }).key,
    ).toBe('at_place');
  });

  it('marks arrival inside 75 m of the meet-up', () => {
    expect(memberStatus({ activity: 'walking', poiName: 'X', meetupDistanceM: 60 }).key).toBe(
      'arrived',
    );
  });

  it('falls back without a place or a meet-up', () => {
    expect(memberStatus({ activity: 'stationary', poiName: null, meetupDistanceM: null })).toEqual({
      key: 'still',
      poi: null,
      distanceM: null,
    });
  });
});

describe('formatDistance', () => {
  it('rounds like the map', () => {
    expect(formatDistance(904)).toBe('900 m');
    expect(formatDistance(2040)).toBe('2 km');
    expect(formatDistance(2440)).toBe('2.4 km');
    expect(formatDistance(12_600)).toBe('13 km');
  });
});

describe('member status in storage', () => {
  it('round-trips a key with and without a place', () => {
    const leaving = { key: 'leaving_place', poi: 'Karsa Spa: East', distanceM: 900 } as const;
    expect(decodeMemberStatus(encodeMemberStatus(leaving), 900)).toEqual(leaving);
    expect(decodeMemberStatus('still', null)).toEqual({ key: 'still', poi: null, distanceM: null });
    expect(decodeMemberStatus('mystery', null).key).toBe('unknown');
  });
});
