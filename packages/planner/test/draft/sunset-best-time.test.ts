/**
 * A place best at sunset is on time around the real sunset where it is on the day, not at a fixed
 * clock time: London's November sun is gone by twenty past four, Singapore's sets near seven.
 */
import { describe, expect, it } from 'vitest';

import { missesBestTime, sunsetMin } from '../../src/draft/index';

const DATE = '2026-11-07';
const LONDON = { bestTimes: ['sunset'] as const, lat: 51.5074, lng: -0.1278, tz: 'Europe/London' };
const SINGAPORE = {
  bestTimes: ['sunset'] as const,
  lat: 1.2868,
  lng: 103.8545,
  tz: 'Asia/Singapore',
};
const at = (hour: number, minute = 0) => hour * 60 + minute;

describe('a sunset best time', () => {
  it('follows the sun at the place on the day', () => {
    expect(sunsetMin(LONDON, DATE)).toBeGreaterThanOrEqual(at(16, 10));
    expect(sunsetMin(LONDON, DATE)).toBeLessThanOrEqual(at(16, 25));
    expect(sunsetMin(SINGAPORE, DATE)).toBeGreaterThanOrEqual(at(18, 45));
    expect(sunsetMin(SINGAPORE, DATE)).toBeLessThanOrEqual(at(19, 0));
  });

  it('is met in the golden hour before the sun goes and missed once it is dark', () => {
    expect(missesBestTime(LONDON, at(15), DATE)).toBe(false);
    expect(missesBestTime(LONDON, at(17, 30), DATE)).toBe(true);
    expect(missesBestTime(SINGAPORE, at(19, 45), DATE)).toBe(false);
    expect(missesBestTime(SINGAPORE, at(16, 30), DATE)).toBe(true);
  });
});
