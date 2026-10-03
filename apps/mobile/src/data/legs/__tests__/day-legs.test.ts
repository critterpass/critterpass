/**
 * A day's legs read the stored leg for each pair of stops, and estimate the rest in a straight
 * line: walking when the stops are close, driving otherwise, always marked "about".
 */
import { describe, expect, it } from '@jest/globals';

import { dayLegs, WALK_MAX_M, type LegEnd, type StoredLeg } from '../day-legs';

const STAY: LegEnd = { key: 'stay', lat: -8.515, lng: 115.258 };
const RIDGE: LegEnd = { key: 'ridge', lat: -8.5031, lng: 115.2543 };
const SPA: LegEnd = { key: 'spa', lat: -8.5025, lng: 115.2547 };

const stored: StoredLeg = {
  from_key: 'stay',
  to_key: 'ridge',
  mode: 'drive',
  minutes: 12,
  meters: 2100,
  source: 'valhalla',
  approx: 0,
};

describe('dayLegs', () => {
  it('reads the stored leg where the plan has one', () => {
    const [first] = dayLegs([STAY, RIDGE], [stored]);
    expect(first).toEqual({
      from: 'stay',
      to: 'ridge',
      mode: 'drive',
      minutes: 12,
      meters: 2100,
      source: 'valhalla',
      approx: false,
    });
  });

  it('estimates the rest: a short hop on foot, a long one by car, both marked about', () => {
    const [, short, back] = dayLegs([STAY, RIDGE, SPA, STAY], [stored]);
    expect(short).toMatchObject({ from: 'ridge', to: 'spa', mode: 'walk', approx: true });
    expect(short?.source).toBe('straight_line');
    expect(short?.meters).toBeLessThanOrEqual(WALK_MAX_M);
    expect(back).toMatchObject({ from: 'spa', to: 'stay', mode: 'drive', approx: true });
  });

  it('falls back to an estimate for a stored leg in a mode the app does not know', () => {
    const [leg] = dayLegs([STAY, RIDGE], [{ ...stored, mode: 'hovercraft' }]);
    expect(leg?.source).toBe('straight_line');
    expect(dayLegs([STAY], [])).toEqual([]);
  });
});
