import { describe, expect, it } from '@jest/globals';

import { centreOf, distanceMeters, fold } from '../map-model';

describe('place geometry and names', () => {
  const daNang = [
    { lat: 16.06, lng: 108.22 },
    { lat: 16.1, lng: 108.25 },
  ];

  it('measures great-circle distance', () => {
    const saigon = { lat: 10.82, lng: 106.63 };
    expect(Math.round(distanceMeters(saigon, { lat: 16.06, lng: 108.22 }) / 1000)).toBe(607);
  });

  it('finds the middle of the places, and none without places', () => {
    expect(centreOf(daNang)).toEqual({ lat: 16.08, lng: 108.235 });
    expect(centreOf([])).toBeNull();
  });

  it('folds Vietnamese marks away, so a name typed without them matches', () => {
    expect(fold('Đà Nẵng')).toBe('da nang');
    expect(fold('Chợ Cồn')).toBe('cho con');
  });
});
