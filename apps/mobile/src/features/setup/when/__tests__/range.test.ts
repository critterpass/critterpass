/**
 * The day picker's rules: a first tap anchors, a second closes the range (either order), the
 * anchor again takes the ghost, a tap inside moves the nearer end, a drag sweeps or moves an end,
 * the domain's length bounds what can be locked, the ghost leaves off a last day that would drop
 * someone, and the best windows rank by who can make every day (half the crew at least).
 */
import { describe, expect, it } from '@jest/globals';

import { TRIP_LENGTH_MAX_DAYS } from '@cp/domain';

import { heatMonths, type SummaryRow } from '../model';
import {
  bestWindows,
  dragGrip,
  dragTo,
  EMPTY_PICK,
  freeAllDays,
  freeByDate,
  ghostRange,
  rangeLength,
  rangeProblem,
  shownRange,
  tapDay,
} from '../range';

function rows(free: Record<string, number>): SummaryRow[] {
  return Object.entries(free).map(([date, count]) => ({
    date,
    free_count: count,
    maybe_count: 0,
    busy_count: 6 - count,
    unknown_count: 0,
    member_count: 6,
    computed_at: null,
  }));
}

/** May 2027: all six free on the 3rd–8th, four on the 9th, five on the 20th–27th, else two. */
const MAY: Record<string, number> = {};
for (let day = 1; day <= 31; day += 1) {
  const date = `2027-05-${String(day).padStart(2, '0')}`;
  MAY[date] = day >= 3 && day <= 8 ? 6 : day === 9 ? 4 : day >= 20 && day <= 27 ? 5 : 2;
}
const FREE = freeByDate(heatMonths(rows(MAY)));

describe('tapping days', () => {
  it('anchors on the first tap and closes the range on the second, in either order', () => {
    const anchored = tapDay(EMPTY_PICK, '2027-05-10', null);
    expect(anchored).toEqual({ anchor: '2027-05-10', range: null });
    expect(tapDay(anchored, '2027-05-14', null).range).toEqual({
      start: '2027-05-10',
      end: '2027-05-14',
    });
    expect(tapDay(anchored, '2027-05-04', null).range).toEqual({
      start: '2027-05-04',
      end: '2027-05-10',
    });
  });

  it('takes the ghost when the first day is tapped again, or that one day without one', () => {
    const anchored = tapDay(EMPTY_PICK, '2027-05-03', null);
    const ghost = { start: '2027-05-03', end: '2027-05-08' };
    expect(tapDay(anchored, '2027-05-03', ghost)).toEqual({ anchor: null, range: ghost });
    expect(tapDay(anchored, '2027-05-03', null).range).toEqual({
      start: '2027-05-03',
      end: '2027-05-03',
    });
  });

  it('moves the nearer end on a tap inside, the last day on a tie, and starts over outside', () => {
    const pick = { anchor: null, range: { start: '2027-05-10', end: '2027-05-20' } };
    expect(tapDay(pick, '2027-05-12', null).range).toEqual({
      start: '2027-05-12',
      end: '2027-05-20',
    });
    expect(tapDay(pick, '2027-05-17', null).range).toEqual({
      start: '2027-05-10',
      end: '2027-05-17',
    });
    expect(tapDay(pick, '2027-05-15', null).range).toEqual({
      start: '2027-05-10',
      end: '2027-05-15',
    });
    expect(tapDay(pick, '2027-05-10', null)).toBe(pick);
    expect(tapDay(pick, '2027-05-25', null)).toEqual({ anchor: '2027-05-25', range: null });
  });
});

describe('dragging across days', () => {
  it('sweeps a new range from where the drag began, either way', () => {
    expect(dragGrip(EMPTY_PICK, '2027-05-10')).toBe('new');
    expect(dragTo(EMPTY_PICK, '2027-05-10', 'new', '2027-05-13').range).toEqual({
      start: '2027-05-10',
      end: '2027-05-13',
    });
    expect(dragTo(EMPTY_PICK, '2027-05-10', 'new', '2027-05-07').range).toEqual({
      start: '2027-05-07',
      end: '2027-05-10',
    });
  });

  it('moves the end it was held by, past the other end too', () => {
    const pick = { anchor: null, range: { start: '2027-05-10', end: '2027-05-14' } };
    expect(dragGrip(pick, '2027-05-14')).toBe('end');
    expect(dragTo(pick, '2027-05-14', 'end', '2027-05-18').range).toEqual({
      start: '2027-05-10',
      end: '2027-05-18',
    });
    expect(dragGrip(pick, '2027-05-10')).toBe('start');
    expect(dragTo(pick, '2027-05-10', 'start', '2027-05-16').range).toEqual({
      start: '2027-05-14',
      end: '2027-05-16',
    });
  });
});

describe('trip length', () => {
  it('locks one day up to the most the domain allows, and says why past it', () => {
    expect(rangeProblem({ start: '2027-05-10', end: '2027-05-10' })).toBeNull();
    const longest = { start: '2027-05-01', end: '2027-05-30' };
    expect(rangeLength(longest)).toBe(TRIP_LENGTH_MAX_DAYS);
    expect(rangeProblem(longest)).toBeNull();
    expect(rangeProblem({ start: '2027-05-01', end: '2027-05-31' })).toBe('too_long');
  });
});

describe('the ghost suggestion', () => {
  it('runs the planned length from the first day', () => {
    expect(ghostRange(FREE, '2027-05-20', 5, null)).toEqual({
      start: '2027-05-20',
      end: '2027-05-24',
    });
    expect(shownRange({ anchor: '2027-05-20', range: null }, ghostRangeOf('2027-05-20'))).toEqual(
      ghostRangeOf('2027-05-20'),
    );
  });

  it('leaves off a last day that would drop someone', () => {
    // 3rd–9th is seven days, but on the 9th only four are free: the 3rd–8th keeps all six.
    expect(ghostRange(FREE, '2027-05-03', 7, null)).toEqual({
      start: '2027-05-03',
      end: '2027-05-08',
    });
  });

  it('stops at the last day shown and keeps the length inside the domain', () => {
    expect(ghostRange(FREE, '2027-05-29', 7, '2027-05-31').end).toBe('2027-05-31');
    expect(rangeLength(ghostRange(FREE, '2027-05-01', 90, null))).toBe(TRIP_LENGTH_MAX_DAYS);
  });
});

describe('best windows', () => {
  it('ranks windows half the crew can make by who can make every day, never overlapping', () => {
    const windows = bestWindows(FREE, 6, '2027-05-01', 6);
    expect(windows).toEqual([
      { range: { start: '2027-05-03', end: '2027-05-08' }, free: 6 },
      { range: { start: '2027-05-20', end: '2027-05-25' }, free: 5 },
    ]);
    expect(windows.every((w) => freeAllDays(FREE, w.range) === w.free)).toBe(true);
  });

  it('offers only the single best window when none reaches half the crew', () => {
    expect(bestWindows(FREE, 6, '2027-05-01', 12)).toEqual([
      { range: { start: '2027-05-03', end: '2027-05-08' }, free: 6 },
    ]);
  });

  it('starts no earlier than today and skips windows nobody can make', () => {
    expect(bestWindows(FREE, 6, '2027-05-04', 6).every((w) => w.range.start >= '2027-05-04')).toBe(
      true,
    );
    expect(
      bestWindows(freeByDate(heatMonths(rows({ '2027-05-01': 0 }))), 1, '2027-05-01', 6),
    ).toEqual([]);
  });
});

function ghostRangeOf(anchor: string) {
  return ghostRange(FREE, anchor, 5, null);
}
