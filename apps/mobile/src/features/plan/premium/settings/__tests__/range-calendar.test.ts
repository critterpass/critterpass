import { monthCells, nextRange, shiftMonth } from '../range-calendar';

describe('picking a new date range', () => {
  it('lays a month out from Monday with blanks before its first day', () => {
    // 1 April 2027 is a Thursday: three blanks lead.
    const cells = monthCells('2027-04');
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2027-04-01']);
    expect(cells.at(-1)).toBe('2027-04-30');
    expect(cells.filter((cell) => cell !== null)).toHaveLength(30);
  });

  it('pages across a year end', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('starts, ends, and starts again on a tap before the start or after a full range', () => {
    const started = nextRange({ start: null, end: null }, '2027-04-02');
    expect(started).toEqual({ start: '2027-04-02', end: null });
    const ended = nextRange(started, '2027-04-09');
    expect(ended).toEqual({ start: '2027-04-02', end: '2027-04-09' });
    expect(nextRange(ended, '2027-04-12')).toEqual({ start: '2027-04-12', end: null });
    expect(nextRange(started, '2027-03-30')).toEqual({ start: '2027-03-30', end: null });
  });
});
