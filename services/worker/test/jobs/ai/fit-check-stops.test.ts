/**
 * Before a draft, a must-do in a later stop's city is judged on that stop's dates alone: a place
 * open only while the crew is elsewhere clashes, the day the crew arrives is a short one, and a
 * stop's last day is a full day unless the trip ends there.
 */
import { describe, expect, it } from 'vitest';

import { datesForStop, judgeMustDo } from '../../../src/jobs/ai/fit-check';

// Mon 5 April 2027 … Fri 9 April: two nights in the first city, then the second.
const DATES = ['2027-04-05', '2027-04-06', '2027-04-07', '2027-04-08', '2027-04-09'];
const STOPS = [
  { position: 1, nights: 2 },
  { position: 2, nights: 2 },
];
const THREE = [
  { position: 1, nights: 1 },
  { position: 2, nights: 2 },
  { position: 3, nights: 1 },
];

const row = (weekly: Record<string, { start: string; end: string }[]>, stop: number | null) => ({
  id: 'must-do',
  title: 'The citadel',
  poi_name: 'The citadel',
  hours: { weekly },
  tags: [],
  time_needed_min: 120,
  fit_status: 'unknown',
  fit_note: null,
  fit_checked_at: null,
  external_action: 'none',
  external_deadline: null,
  stop_position: stop,
});

const judge = (
  weekly: Record<string, { start: string; end: string }[]>,
  stop: number | null,
  stops = STOPS,
) => {
  const on = datesForStop(DATES, stops, stop);
  return judgeMustDo(row(weekly, stop), on.dates, DATES[0]!, on.leaves).status;
};

const ALL_DAY = [{ start: '08:00', end: '18:00' }];

describe('the dates a must-do is checked on', () => {
  it('are the second stop’s days for a place in its city', () => {
    expect(datesForStop(DATES, STOPS, 2)).toEqual({ dates: DATES.slice(2), leaves: true });
  });

  it('are every date of the trip for the first stop’s places and on a one-stop trip', () => {
    expect(datesForStop(DATES, STOPS, null)).toEqual({ dates: DATES, leaves: true });
    expect(datesForStop(DATES, STOPS, 1)).toEqual({ dates: DATES, leaves: true });
    expect(datesForStop(DATES, [], 2)).toEqual({ dates: DATES, leaves: true });
  });

  it('end on a full day for a middle stop', () => {
    expect(datesForStop(DATES, THREE, 2)).toEqual({ dates: DATES.slice(1, 3), leaves: false });
  });
});

describe('a must-do in the second city', () => {
  it('fits when it is open on days spent there, and is tight with one such day', () => {
    expect(judge({ th: ALL_DAY, fr: ALL_DAY }, 2)).toBe('fits');
    expect(judge({ th: ALL_DAY }, 2)).toBe('tight');
  });

  it('clashes when it is open only while the crew is in the first city', () => {
    expect(judge({ tu: ALL_DAY }, 2)).toBe('clash');
    // The same place in the first city has its one Tuesday.
    expect(judge({ tu: ALL_DAY }, null)).toBe('tight');
  });

  it('cannot use the morning of the day the crew arrives', () => {
    expect(judge({ we: [{ start: '08:00', end: '12:00' }] }, 2)).toBe('clash');
  });

  it('can use the afternoon of a middle stop’s last day, which nobody leaves on', () => {
    const afternoon = { we: [{ start: '13:00', end: '18:00' }] };
    expect(judge(afternoon, 2, THREE)).toBe('tight');
    // On the day the trip ends there, the afternoon is the way home.
    const ending = datesForStop(DATES.slice(0, 4), STOPS, 2);
    const thursday = row({ th: [{ start: '13:00', end: '18:00' }] }, 2);
    expect(judgeMustDo(thursday, ending.dates, DATES[0]!, ending.leaves).status).toBe('clash');
  });
});
