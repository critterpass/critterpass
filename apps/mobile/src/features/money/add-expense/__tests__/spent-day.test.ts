/**
 * The day chips of an expense: the chip follows the day it was spent, and picking a day changes
 * the time only when it is another day (today on an edit included).
 */
import { describe, expect, it } from '@jest/globals';

import { daysBackOf, spentAtForDay } from '../spent-day';

const NOW = new Date(2026, 9, 8, 15, 30);
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

describe('the day an expense was spent', () => {
  it('counts calendar days back from today, not 24-hour spans', () => {
    expect(daysBackOf(null, NOW)).toBe(0);
    expect(daysBackOf(at(8, 1), NOW)).toBe(0);
    // Late last night is yesterday even though it is under a day ago.
    expect(daysBackOf(at(7, 23), NOW)).toBe(1);
    expect(daysBackOf(at(5, 9), NOW)).toBe(3);
    expect(daysBackOf(at(9, 9), NOW)).toBe(0);
    expect(daysBackOf('not a date', NOW)).toBe(0);
  });

  it('leaves the time alone when the chip picked is already the expense day', () => {
    const current = at(5, 9);
    expect(spentAtForDay({ daysBack: 3, current, editing: true, now: NOW })).toBeNull();
    expect(spentAtForDay({ daysBack: 0, current: null, editing: false, now: NOW })).toBeNull();
  });

  it('means "now" for today on a new expense and a real time for today on an edit', () => {
    const backDated = at(5, 9);
    expect(spentAtForDay({ daysBack: 0, current: backDated, editing: false, now: NOW })).toEqual({
      at: null,
    });
    // An edit must send a time, or moving a back-dated expense to today changes nothing.
    expect(spentAtForDay({ daysBack: 0, current: backDated, editing: true, now: NOW })).toEqual({
      at: NOW.toISOString(),
    });
  });

  it('keeps the time of day when another day is picked', () => {
    const picked = spentAtForDay({ daysBack: 2, current: null, editing: false, now: NOW });
    expect(picked?.at).toBe(new Date(2026, 9, 6, 15, 30).toISOString());
  });
});
