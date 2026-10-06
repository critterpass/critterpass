import { describe, expect, it } from 'vitest';

import { checkPlan } from '../../src/check/index';
import { assembleFitContext, fitPlace, type FitDay, type FitPlace } from '../../src/fit/index';
import { BALI_CHECK, BALI_CHECK_CONTEXT, DINNER, ULUWATU } from '../check/bali-check-fixture';
import { at, BALI, POINTS } from './bali-fixture';

const UBUD = 'ubud-area';
const NUSA = 'nusa-penida-area';

/** The Bali week with day 5 spent on a day trip to Nusa Penida, two hours each way. */
const withDayTrip = {
  ...BALI,
  days: BALI.days.map((day): FitDay =>
    day.dayNo === 5 ? { ...day, areaId: NUSA, link: { minutes: 120 } } : { ...day, areaId: UBUD },
  ),
};

const place = (areaId: string): FitPlace => ({
  poiId: null,
  point: POINTS.terraces,
  category: 'nature',
  hours: null,
  timeNeededMin: 90,
  outdoor: true,
  areaId,
});

const grades = (fit: ReturnType<typeof fitPlace>) =>
  Object.fromEntries(fit.days.map((day) => [day.day_no, day.grade]));

describe('a place on a trip with a day trip', () => {
  it('fits the day-trip day when it lies in the area, and no other day', () => {
    const fit = fitPlace(withDayTrip, place(NUSA));
    const byDay = grades(fit);
    expect(byDay[5]).not.toBe('no');
    for (const dayNo of [1, 2, 3, 4, 6]) expect(byDay[dayNo]).toBe('no');
    const other = fit.days.find((day) => day.day_no === 3);
    expect(other?.reasons[0]).toEqual({ code: 'no_window', params: { day_no: 3 } });
  });

  it('never puts a place of the city on the day-trip day', () => {
    expect(grades(fitPlace(withDayTrip, place(UBUD)))[5]).toBe('no');
  });

  it('fits as before on a trip that names no areas', () => {
    expect(grades(fitPlace(BALI, place(UBUD)))).toEqual(grades(fitPlace(BALI, place(NUSA))));
  });
});

describe('the hours of a day trip, read from stored days', () => {
  it('open when the area is reached and close when the crew must start back', () => {
    const context = assembleFitContext({
      tz: BALI.tz,
      participants: BALI.participants,
      driveFactor: 1,
      days: [
        { day_id: 'd1', day_no: 1, date: '2026-10-13' },
        { day_id: 'd2', day_no: 2, date: '2026-10-14', area_id: NUSA, link_minutes: 120 },
        { day_id: 'd3', day_no: 3, date: '2026-10-15', arrives_min: 11 * 60 + 30 },
        { day_id: 'd4', day_no: 4, date: '2026-10-16' },
      ],
      items: [],
      stays: new Map(),
      rain: new Map(),
      monthFactors: new Map(),
    });
    const [, trip, arrival] = context.days;
    expect(trip).toMatchObject({ fromMin: 9 * 60, toMin: 19 * 60, areaId: NUSA });
    expect(trip?.link).toEqual({ minutes: 120 });
    expect(arrival).toMatchObject({ fromMin: 13 * 60, toMin: 22 * 60 });
  });
});

describe('too far on a day trip', () => {
  const dayTrip = (secondStopFar: boolean) => ({
    ...BALI_CHECK,
    context: {
      ...BALI_CHECK_CONTEXT,
      days: BALI_CHECK_CONTEXT.days.map((day): FitDay => {
        if (day.dayNo !== 6) return day;
        const far = day.items.find((item) => item.stableId === ULUWATU)?.point ?? null;
        return {
          ...day,
          link: { minutes: 240 },
          items: day.items.map((item) =>
            item.stableId === DINNER && secondStopFar
              ? { ...item, point: far, startsAt: at(18, '19:30'), endsAt: at(18, '20:30') }
              : item,
          ),
        };
      }),
    },
  });
  const tooFarDays = (input: typeof BALI_CHECK) =>
    checkPlan(input)
      .filter((issue) => issue.kind === 'too_far')
      .map((issue) => issue.dayNo);

  it('counts a four-hour link as time, never as driving', () => {
    expect(tooFarDays(dayTrip(true))).toEqual([]);
  });

  it('still names a two-hour drive after dark between two of its stops', () => {
    expect(tooFarDays(dayTrip(false))).toEqual([6]);
  });
});
