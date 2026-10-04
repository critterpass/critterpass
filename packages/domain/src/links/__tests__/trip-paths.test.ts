import { describe, expect, it } from 'vitest';

import { currentAppPath, tripDayOfPath, tripDayPath, tripHubPath } from '../trip-paths';

const TRIP = '0b8f6c1e-58f1-4a53-9d0e-6a8c8f0f4a11';

describe('trip hub and day paths', () => {
  it('builds the paths of the screens in the trips tab', () => {
    expect(tripHubPath(TRIP)).toBe(`/trips/${TRIP}`);
    expect(tripDayPath(TRIP, '2026-10-17')).toBe(`/trips/${TRIP}/day/2026-10-17`);
  });

  it('reads the hub shapes of rows already sent as the same screens', () => {
    expect(currentAppPath(`/hub/${TRIP}`)).toBe(`/trips/${TRIP}`);
    expect(currentAppPath(`/hub/${TRIP}/`)).toBe(`/trips/${TRIP}`);
    expect(currentAppPath(`/hub/${TRIP}/day/2026-10-17`)).toBe(`/trips/${TRIP}/day/2026-10-17`);
    expect(currentAppPath(`/hub/${TRIP}/day/today?from=push`)).toBe(
      `/trips/${TRIP}/day/today?from=push`,
    );
  });

  it('leaves every other path alone, the offline pages under hub included', () => {
    for (const path of [
      `/hub/${TRIP}/offline`,
      '/hub/offline-storage',
      '/hub/',
      `/trips/${TRIP}`,
      `/crew/${TRIP}/chat`,
      `/trip/${TRIP}/plan`,
    ]) {
      expect(currentAppPath(path)).toBe(path);
    }
  });

  it('names the trip and day of a day-of path in either shape', () => {
    const day = { tripId: TRIP, localDate: '2026-10-17' };
    expect(tripDayOfPath(`/hub/${TRIP}/day/2026-10-17`)).toEqual(day);
    expect(tripDayOfPath(`/trips/${TRIP}/day/2026-10-17`)).toEqual(day);
    expect(tripDayOfPath(`/trips/${TRIP}`)).toBeNull();
    expect(tripDayOfPath(`/crew/${TRIP}/chat`)).toBeNull();
  });
});
