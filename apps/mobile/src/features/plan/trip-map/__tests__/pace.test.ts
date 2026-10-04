/** How full a day reads: planned minutes, overlaps counted once, against 07:00 to 22:00. */
import { describe, expect, it } from '@jest/globals';

import { dayPace, paceLevel, plannedMinutes } from '../pace';

const at = (h: number, m = 0) => h * 60 + m;

describe('pace', () => {
  it('lights nothing for an empty day and at least one bar for any plan', () => {
    expect(dayPace([])).toBe(0);
    expect(dayPace([{ start: at(10), end: at(10, 30) }])).toBe(1);
  });

  it('counts a split afternoon once', () => {
    const spa = { start: at(14), end: at(16) };
    const walk = { start: at(14), end: at(15, 30) };
    expect(plannedMinutes([spa, walk])).toBe(120);
  });

  it('counts only the waking hours of an overnight pickup', () => {
    expect(plannedMinutes([{ start: at(3, 30), end: at(8) }])).toBe(60);
  });

  it('gives an untimed stop an hour', () => {
    expect(plannedMinutes([{ start: null, end: null }])).toBe(60);
  });

  it('fills the bars as the day fills up', () => {
    const waking = at(22) - at(7);
    expect(paceLevel(waking / 5)).toBe(1);
    expect(paceLevel(waking / 2)).toBe(3);
    expect(paceLevel(waking)).toBe(5);
    expect(paceLevel(waking * 2)).toBe(5);
    expect(
      dayPace([
        { start: at(9), end: at(12, 30) },
        { start: at(13), end: at(14) },
        { start: at(14), end: at(15, 30) },
        { start: at(16), end: at(18) },
      ]),
    ).toBe(3);
  });
});
