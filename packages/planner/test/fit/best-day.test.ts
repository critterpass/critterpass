/**
 * Which day a place is suggested for, and when the arrival day opens: a full day is preferred to
 * the day the crew arrives or leaves even when that travel day is the emptier one, a travel day
 * is still the answer when no full day takes the place, and nothing is suggested on the arrival
 * day before the plan's own first stop there.
 */
import { describe, expect, it } from 'vitest';

import { assembleFitContext, fitPlace, type FitContext, type FitPlace } from '../../src/fit/index';
import { BALI, DAY, POINTS, TIRTA, TZ, at, daily } from './bali-fixture';

const day = (n: number) => BALI.days.find((entry) => entry.dayNo === n)!;

describe('the best day for a place', () => {
  // The crew leaves on Sunday afternoon: its morning is free and empty.
  const leaving: FitContext = {
    ...BALI,
    days: [day(1), day(2), day(3), day(4), day(5), { ...day(6), toMin: 12 * 60 }],
  };

  it('is a full day before the day the crew leaves, though that day is emptier', () => {
    const busySaturday: FitContext = {
      ...leaving,
      days: leaving.days.map((entry) =>
        entry.dayNo === 5
          ? {
              ...entry,
              items: [
                {
                  stableId: DAY(55),
                  poiId: null,
                  category: 'food',
                  startsAt: at(17, '12:30'),
                  endsAt: at(17, '13:30'),
                  attendeeIds: [],
                  locked: false,
                  outdoor: false,
                  point: POINTS.warung,
                },
              ],
            }
          : entry,
      ),
    };
    const fit = fitPlace(busySaturday, TIRTA);
    expect(fit.days.find((entry) => entry.day_no === 6)?.grade).not.toBe('no');
    expect(fit.best?.day_no).toBe(5);
  });

  it('is the travel day when no full day takes the place', () => {
    const sundayOnly: FitPlace = {
      ...TIRTA,
      crowds: null,
      hours: { weekly: { su: [{ start: '08:00', end: '18:00' }] } },
    };
    expect(fitPlace(leaving, sundayOnly).best?.day_no).toBe(6);
  });
});

describe('the arrival day', () => {
  const rows = (firstStop: string | null) => ({
    tz: TZ,
    participants: BALI.participants,
    driveFactor: 1.3,
    days: [
      { day_id: DAY(1), day_no: 1, date: '2026-10-13' },
      { day_id: DAY(2), day_no: 2, date: '2026-10-14' },
    ],
    items:
      firstStop === null
        ? []
        : [
            {
              stable_id: DAY(71),
              day_id: DAY(1),
              poi_id: null,
              category: 'food',
              starts_at: at(13, firstStop),
              ends_at: at(13, '18:00'),
              attendee_ids: null,
              locked: false,
              is_outdoor: false,
              lat: POINTS.warung.lat,
              lng: POINTS.warung.lng,
            },
          ],
    stays: new Map(),
    rain: new Map(),
    monthFactors: new Map(),
  });

  it('opens after the usual landing, and never before the plan’s own first stop', () => {
    expect(assembleFitContext(rows(null)).days[0]?.fromMin).toBe(14 * 60);
    expect(assembleFitContext(rows('16:30')).days[0]?.fromMin).toBe(16 * 60 + 30);
    // A first stop earlier than anyone could have landed does not open the day sooner.
    expect(assembleFitContext(rows('10:00')).days[0]?.fromMin).toBe(14 * 60);
  });

  it('suggests nothing on it before that first stop', () => {
    const open: FitPlace = { ...TIRTA, crowds: null, hours: daily('07:00', '22:00') };
    const arrival = fitPlace(assembleFitContext(rows('16:30')), open).days[0];
    expect(arrival?.slot).not.toBeNull();
    expect(Date.parse(arrival?.slot?.starts_at ?? '')).toBeGreaterThanOrEqual(
      at(13, '18:00').getTime(),
    );
  });
});

describe('a day that has begun', () => {
  it('opens now: nothing is fitted before the time it is', () => {
    const rows = {
      tz: TZ,
      participants: BALI.participants,
      driveFactor: 1.3,
      days: [
        { day_id: DAY(1), day_no: 1, date: '2026-10-13' },
        { day_id: DAY(2), day_no: 2, date: '2026-10-14' },
        { day_id: DAY(3), day_no: 3, date: '2026-10-15' },
      ],
      items: [],
      stays: new Map(),
      rain: new Map(),
      monthFactors: new Map(),
      now: at(14, '14:07'),
    };
    const days = assembleFitContext(rows).days;
    expect(days[1]?.fromMin).toBe(14 * 60 + 15);
    // Days not yet begun keep their own start; days gone by are not touched by now.
    expect(days[2]?.fromMin).toBe(7 * 60);
    expect(days[0]?.fromMin).toBe(14 * 60);
  });
});
