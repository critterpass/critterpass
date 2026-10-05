/**
 * The other day Add to plan points to: a sunset place shown at a time outside its own on a day
 * with no room then points to the nearest day that has room at sunset, with the time; any other
 * place to the guide's best day; nothing when the sheet is already there or she picked the time.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayFit, PlaceFit } from '@cp/domain';
import type { FitPlace } from '@cp/planner';

import { otherDay, otherDayLabel } from '../better-day';

const TZ = 'Asia/Makassar';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAYS = [
  { dayNo: 2, date: '2026-10-20' },
  { dayNo: 3, date: '2026-10-21' },
  { dayNo: 4, date: '2026-10-22' },
];
const day = (dayNo: number, date: string, start: string | null): DayFit => ({
  day_id: id(100 + dayNo),
  day_no: dayNo,
  grade: start === null ? 'no' : 'good',
  slot:
    start === null
      ? null
      : { starts_at: `${date}T${start}:00+08:00`, ends_at: `${date}T${start}:00+08:00` },
  reasons: [],
});
const fit = (best: number, days: DayFit[]): PlaceFit => {
  const top = days.find((entry) => entry.day_no === best);
  return {
    poi_id: id(1),
    best: { day_id: id(100 + best), day_no: best, grade: 'good', slot: top!.slot! },
    days,
  };
};
const sunset: FitPlace = {
  poiId: id(1),
  point: { lat: -8.62, lng: 115.09 },
  category: 'temple_shrine',
  hours: null,
  outdoor: true,
  name: 'Tanah Lot',
  bestTimeText: 'Sunset hour for golden light',
};
const museum: FitPlace = { ...sunset, category: 'museum', name: 'Museum', bestTimeText: null };

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('the other day Add to plan points to', () => {
  const answer = fit(2, [
    day(2, '2026-10-20', '07:45'),
    day(3, '2026-10-21', null),
    day(4, '2026-10-22', '17:30'),
  ]);

  it('points a sunset place shown in the morning to the day with room at sunset, with the time', () => {
    const choice = { dayNo: 2, startMin: 7 * 60 + 45, timePicked: false };
    const other = otherDay({
      fit: answer,
      place: sunset,
      choice,
      days: DAYS,
      tz: TZ,
      lengthMin: 60,
    });
    expect(other).toEqual({ dayNo: 4, startMin: 17 * 60 + 30 });
    expect(otherDayLabel(other!, 'Tokek', 'Thu 22 Oct', '17:30')).toBe(
      'Better on Thu 22 Oct at 17:30',
    );
  });

  it('points any other place to the best day, and says nothing when the sheet is there', () => {
    const elsewhere = { dayNo: 4, startMin: 17 * 60 + 30, timePicked: false };
    expect(
      otherDay({
        fit: answer,
        place: museum,
        choice: elsewhere,
        days: DAYS,
        tz: TZ,
        lengthMin: 60,
      }),
    ).toEqual({ dayNo: 2, startMin: null });
    const there = { dayNo: 2, startMin: 7 * 60 + 45, timePicked: false };
    expect(
      otherDay({ fit: answer, place: museum, choice: there, days: DAYS, tz: TZ, lengthMin: 60 }),
    ).toBe(null);
  });

  it('leaves a time she picked herself alone', () => {
    const picked = { dayNo: 2, startMin: 7 * 60 + 45, timePicked: true };
    expect(
      otherDay({ fit: answer, place: sunset, choice: picked, days: DAYS, tz: TZ, lengthMin: 60 }),
    ).toBe(null);
  });
});
