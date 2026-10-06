import { describe, expect, it } from 'vitest';

import { tripRemovals } from '../../src/trips/removal';

describe('tripRemovals', () => {
  it('lets an organiser delete a setup trip nobody else is on, and cancel it once others are', () => {
    expect(tripRemovals({ status: 'setup', organiser: true, othersOnTrip: 0 })).toEqual(['delete']);
    expect(tripRemovals({ status: 'setup', organiser: true, othersOnTrip: 2 })).toEqual(['cancel']);
  });

  it('lets an organiser cancel only before the trip starts', () => {
    for (const status of ['proposed', 'confirmed', 'pre_trip']) {
      expect(tripRemovals({ status, organiser: true, othersOnTrip: 3 })).toEqual(['cancel']);
    }
    for (const status of ['voting', 'drafting', 'in_trip', 'post_trip', 'cancelled']) {
      expect(tripRemovals({ status, organiser: true, othersOnTrip: 3 })).toEqual([]);
    }
  });

  it('lets a member leave until the trip is under way', () => {
    expect(tripRemovals({ status: 'confirmed', organiser: false, othersOnTrip: 1 })).toEqual([
      'leave',
    ]);
    for (const status of ['in_trip', 'post_trip', 'archived', 'cancelled']) {
      expect(tripRemovals({ status, organiser: false, othersOnTrip: 1 })).toEqual([]);
    }
  });
});
