import { describe, expect, it } from 'vitest';

import { bunch } from '../bunch';

const T = Date.parse('2026-10-18T09:00:00Z');
// ~0.00045° of latitude is ~50 m.
const maya = { uid: 'maya', lat: -8.5, lng: 115.26, at: T };
const rin = { uid: 'rin', lat: -8.50045, lng: 115.26, at: T + 30_000 };
const alex = { uid: 'alex', lat: -8.51, lng: 115.27, at: T };

describe('bunch', () => {
  it('merges members within 60 m and 2 minutes', () => {
    const result = bunch([maya, rin, alex]);
    expect(result.map((b) => b.members.map((m) => m.uid))).toEqual([['maya', 'rin'], ['alex']]);
    expect(result[0]?.lat).toBeCloseTo(-8.500225, 6);
  });

  it('keeps members apart when their fixes are more than 2 minutes apart', () => {
    const late = { ...rin, at: T + 3 * 60_000 };
    expect(bunch([maya, late]).map((b) => b.members.length)).toEqual([1, 1]);
  });

  it('chains close members into one bunch', () => {
    const jordan = { uid: 'jordan', lat: -8.5009, lng: 115.26, at: T };
    expect(bunch([maya, rin, jordan]).map((b) => b.members.map((m) => m.uid))).toEqual([
      ['maya', 'rin', 'jordan'],
    ]);
  });

  it('returns nothing for nobody', () => {
    expect(bunch([])).toEqual([]);
  });
});
