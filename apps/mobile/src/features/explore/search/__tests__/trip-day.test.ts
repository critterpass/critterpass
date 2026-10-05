import { describe, expect, it, jest } from '@jest/globals';

import { fitForDay, nearestRows, onTripDay, tripDayFrom } from '../trip-day';

jest.mock('expo-location', () => ({}));

const MON = '00000000-0000-4000-8000-000000000001';
const TUE = '00000000-0000-4000-8000-000000000002';
const slot = (start: string) => ({
  starts_at: `2026-10-05T${start}:00+07:00`,
  ends_at: '2026-10-05T10:00:00+07:00',
});

describe('search on a day of the trip', () => {
  const trip = {
    tz: 'Asia/Ho_Chi_Minh',
    days: [
      { id: MON, dayNo: 1, date: '2026-10-05', weekday: 'Mon' },
      { id: TUE, dayNo: 2, date: '2026-10-06', weekday: 'Tue' },
    ],
  };

  it('knows a trip day in the trip’s own zone', () => {
    // 23:30 UTC on the 4th is 06:30 on the 5th in Vietnam.
    expect(onTripDay(trip, new Date('2026-10-04T23:30:00Z'))).toBe(true);
    expect(onTripDay(trip, new Date('2026-10-07T03:00:00Z'))).toBe(false);
  });

  it('measures from her spot when she is near the day, else from its next stop', () => {
    const stop = { lat: 16.06, lng: 108.24 };
    const near = { lat: 16.07, lng: 108.22 };
    const home = { lat: 41.6, lng: -93.6 };
    expect(tripDayFrom(near, stop)).toBe(near);
    expect(tripDayFrom(home, stop)).toBe(stop);
    expect(tripDayFrom(null, stop)).toBe(stop);
    expect(tripDayFrom(near, null)).toBe(near);
  });

  it('runs rows nearest first from where she is, rows with no spot last', () => {
    const here = { lat: 16.06, lng: 108.22 };
    const rows = [
      { name: 'Up the pass', lat: 16.19, lng: 108.13 },
      { name: 'No spot', lat: null, lng: null },
      { name: 'Round the corner', lat: 16.061, lng: 108.221 },
    ];
    expect(nearestRows(rows, here).map((row) => row.name)).toEqual([
      'Round the corner',
      'Up the pass',
      'No spot',
    ]);
    expect(nearestRows(rows, null)).toEqual(rows);
  });

  it('names the day the search was opened for when the place fits it', () => {
    const fit = {
      poi_id: null,
      best: { day_id: TUE, day_no: 2, grade: 'good' as const, slot: slot('09:00') },
      days: [
        { day_id: MON, day_no: 1, grade: 'possible' as const, slot: slot('16:00'), reasons: [] },
        { day_id: TUE, day_no: 2, grade: 'good' as const, slot: slot('09:00'), reasons: [] },
      ],
    };
    expect(fitForDay(fit, MON)?.best?.day_id).toBe(MON);
    expect(fitForDay(fit, null)).toBe(fit);
    const noMon = {
      ...fit,
      days: [
        { day_id: MON, day_no: 1, grade: 'no' as const, slot: null, reasons: [] },
        fit.days[1]!,
      ],
    };
    expect(fitForDay(noMon, MON)?.best?.day_id).toBe(TUE);
  });
});
