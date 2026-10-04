/**
 * Days are named by date: one date format on every label ("Th 7, 17/10"), chips that read weekday
 * over date with today marked, and filter chips that are left out when nothing is behind them.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { chipWeekday, dateLine, dayOfMonth, dayOfTrip } from '../format';
import { NO_FILTER } from '../map-places';
import { checkCounts, checkingLine, dayChips } from '../sheet-copy';
import type { TripDay } from '../trip-days';
import { filterChips } from '../trip-map-filters';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const day = (dayNo: number, date: string | null) =>
  ({ dayNo, date, color: 'pink', stops: [] }) as unknown as TripDay;

describe('a day by its date', () => {
  it('names the month in English and keeps the numeric date in Vietnamese', () => {
    // 17 October 2026 is a Saturday.
    expect(dateLine('vi', '2026-10-17')).toBe('Th 7, 17/10');
    expect(dateLine('en-US', '2026-10-17')).toBe('Sat 17 Oct');
    expect(dateLine('en-GB', '2026-10-17')).toBe('Sat 17 Oct');
  });

  it('closes up the Vietnamese weekday on a chip and leaves Sunday and English alone', () => {
    expect(chipWeekday('vi', '2026-10-17')).toBe('T7');
    expect(chipWeekday('vi', '2026-10-18')).toBe('CN');
    expect(chipWeekday('en-US', '2026-10-17')).toBe('Sat');
    expect(chipWeekday('vi', null)).toBe('');
  });

  it('keeps the day number as the second line', () => {
    expect(dayOfMonth('2026-10-07')).toBe('7');
    expect(dayOfTrip(3, 8)).toBe('Day 3 of 8');
  });
});

describe('the day chips', () => {
  const days = [day(1, '2026-10-17'), day(2, '2026-10-18'), day(3, null)];

  it('read weekday over date, and keep the number for a day with no date yet', () => {
    const chips = dayChips(days, 'vi');
    expect(chips.map((chip) => [chip.weekday, chip.dateLabel])).toEqual([
      ['T7', '17'],
      ['CN', '18'],
      ['', undefined],
    ]);
  });

  it('mark today only', () => {
    expect(dayChips(days, 'en-US', '2026-10-18').map((chip) => chip.today === true)).toEqual([
      false,
      true,
      false,
    ]);
    expect(dayChips(days, 'en-US').some((chip) => chip.today === true)).toBe(false);
  });
});

describe('the map’s filter chips', () => {
  const input = {
    day: day(2, '2026-10-18'),
    dayChosen: true,
    weekday: 'Sun 18 Oct',
    categories: ['food'],
    filter: NO_FILTER,
  };

  it('leaves out SAVED with nothing saved and CREW PICKS with no pick two people back', () => {
    const keys = filterChips({ ...input, saved: 0, crewPicks: 0 }).map((chip) => chip.key);
    expect(keys).toEqual(['day', 'cat:food']);
  });

  it('shows them once there is something behind them, the day named by its date', () => {
    const chips = filterChips({ ...input, saved: 3, crewPicks: 1 });
    expect(chips.map((chip) => chip.key)).toEqual(['day', 'saved', 'crew', 'cat:food']);
    expect(chips[0]?.label).toBe('Sun 18 Oct');
  });
});

describe('the check’s counts while it runs again', () => {
  const V1 = 'version-1';
  const V2 = 'version-2';
  const done = { check: { status: 'done', version_id: V1 }, fixes: 5, know: 2 };

  it('are the check’s own once it has run on the version on screen', () => {
    expect(checkCounts(done, V1, undefined)).toEqual({ fixes: 5, know: 2, done: true });
  });

  it('keep the last count, marked as checking, while a new version waits for its check', () => {
    const last = checkCounts(done, V1, undefined);
    // The row still names the version before the edit.
    const stale = checkCounts(done, V2, last);
    expect(stale).toEqual({ fixes: 5, know: 2, done: true, checking: true });
    // The row moved to the new version and is queued, with counts not to be trusted yet.
    const running = checkCounts(
      { check: { status: 'running', version_id: V2 }, fixes: 11, know: 0 },
      V2,
      last,
    );
    expect(running).toEqual({ fixes: 5, know: 2, done: true, checking: true });
    expect(checkingLine(running)).toBe('Checking again after the change…');
  });

  it('say only that the plan is being checked before there is any count', () => {
    const first = checkCounts(
      { check: { status: 'queued', version_id: V1 }, fixes: 0, know: 0 },
      V1,
      undefined,
    );
    expect(first).toEqual({ fixes: 0, know: 0, done: false, checking: true });
    expect(checkingLine(first)).toBe('Checking the plan…');
  });

  it('are silent with no check at all, and follow the hook when it says a run is under way', () => {
    expect(checkCounts({ check: null, fixes: 0, know: 0 }, V1, undefined)).toEqual({
      fixes: 0,
      know: 0,
      done: false,
    });
    expect(checkCounts({ ...done, checking: true }, V1, { fixes: 3, know: 0, done: true })).toEqual(
      {
        fixes: 3,
        know: 0,
        done: true,
        checking: true,
      },
    );
    expect(checkingLine(checkCounts(done, V1, undefined))).toBeNull();
  });
});
