import { openSpans, placeFitSchema, visitMinutes } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { fitPlace, straightLineTravel, type FitPlace } from '../../src/fit/index';
import {
  BALI,
  COFFEE,
  DAY,
  FOUR,
  POINTS,
  SPA,
  TIRTA,
  TIRTA_EMPUL,
  VILLA,
  at,
  daily,
} from './bali-fixture';

describe('fit for Tirta Empul on the Bali trip', () => {
  const fit = fitPlace(BALI, TIRTA);

  it('is good on Saturday at 08:00, with the facts the place card shows', () => {
    const saturday = fit.days.find((day) => day.day_no === 5);
    expect(saturday?.grade).toBe('good');
    expect(saturday?.slot).toEqual({
      starts_at: at(17, '08:00').toISOString(),
      ends_at: at(17, '09:30').toISOString(),
    });
    expect(saturday?.reasons).toEqual(
      expect.arrayContaining([
        { code: 'opens_at', params: { time: '08:00' } },
        { code: 'busy_from', params: { time: '10:00', level: 90, source: 'editorial' } },
        {
          code: 'drive_minutes',
          params: { minutes: 45, from: 'stay', approx: false },
        },
        { code: 'dry_mornings', params: { source: 'normals' } },
        { code: 'free_day', params: { day_no: 5 } },
      ]),
    );
    expect(fit.best).toEqual({
      day_id: DAY(5),
      day_no: 5,
      grade: 'good',
      slot: saturday?.slot,
    });
  });

  it('is no on Wednesday because the terraces take the morning', () => {
    const wednesday = fit.days.find((day) => day.day_no === 2);
    expect(wednesday?.grade).toBe('no');
    expect(wednesday?.slot).toBeNull();
    expect(wednesday?.reasons).toEqual([{ code: 'no_window', params: { day_no: 2 } }]);
  });

  it('names travel days without room, and a day the place is shut', () => {
    const sunday = fit.days.find((day) => day.day_no === 6);
    expect(sunday?.reasons).toEqual([
      { code: 'travel_day', params: { day_no: 6, kind: 'departure' } },
    ]);
    const shutSunday: FitPlace = {
      ...TIRTA,
      hours: { ...daily('08:00', '18:00'), exceptions: [{ date: '2026-10-17', spans: [] }] },
    };
    const saturday = fitPlace(BALI, shutSunday).days.find((day) => day.day_no === 5);
    expect(saturday?.reasons).toEqual([{ code: 'closed_that_day', params: { day_no: 5 } }]);
  });

  it('matches the wire contract', () => {
    expect(placeFitSchema.parse(fit)).toEqual(fit);
  });
});

describe('trade-offs make a slot possible', () => {
  it('a crowded day with no quiet stretch is not a trade-off; a split crew is', () => {
    const split = fitPlace(BALI, { ...TIRTA, stances: { want: 3, ratherNot: 1 } });
    const saturday = split.days.find((day) => day.day_no === 5);
    expect(saturday?.grade).toBe('possible');
    expect(saturday?.reasons).toContainEqual({
      code: 'crew_split',
      params: { want: 3, rather_not: 1 },
    });
  });

  it('only four free: the slot names them', () => {
    const coffee: FitPlace = {
      poiId: COFFEE,
      point: POINTS.coffee,
      category: 'food',
      hours: daily('16:00', '18:00'),
      outdoor: false,
      timeNeededMin: 60,
    };
    const wednesday = fitPlace(BALI, coffee).days.find((day) => day.day_no === 2);
    expect(wednesday?.grade).toBe('possible');
    expect(wednesday?.reasons).toContainEqual({
      code: 'who_free',
      params: { user_ids: FOUR },
    });
    expect(JSON.stringify(wednesday?.reasons)).not.toContain(SPA);
  });

  it('labels unknown hours and still fits on the usual hours of the kind', () => {
    const unknown = fitPlace(BALI, { ...TIRTA, hours: null, crowds: null });
    const saturday = unknown.days.find((day) => day.day_no === 5);
    expect(saturday?.reasons[0]).toEqual({ code: 'hours_unknown', params: {} });
    expect(saturday?.grade).toBe('good');
  });
});

describe('shared place helpers', () => {
  it('opening spans carry an overnight tail into the next morning', () => {
    const bar = { weekly: { fr: [{ start: '20:00', end: '02:00' }] } };
    expect(openSpans(bar, '2026-10-16')).toEqual([{ start: 1200, end: 1560 }]);
    expect(openSpans(bar, '2026-10-17')).toEqual([{ start: 0, end: 120 }]);
  });

  it('visit length: editorial first, then the usual for the kind', () => {
    expect(visitMinutes({ category: 'beach', timeNeededMin: 45 })).toBe(45);
    expect(visitMinutes({ category: 'beach' })).toBe(180);
    expect(visitMinutes({ category: 'other', timeNeededMin: null })).toBe(90);
  });

  it('straight-line travel walks short legs and drives long ones × the drive factor', () => {
    const travel = straightLineTravel(1.3, 1200);
    const near = travel({ key: 'stay', ...VILLA }, { key: 'm', ...POINTS.market });
    expect(near?.mode).toBe('walk');
    const far = travel({ key: 'stay', ...VILLA }, { key: TIRTA_EMPUL, ...POINTS.tirta });
    expect(far).toMatchObject({ mode: 'drive', approx: true });
    expect(far?.minutes).toBeGreaterThan(30);
  });
});

describe('judging one start', () => {
  it('returns only the day of that start, graded at that time', () => {
    const at10 = fitPlace(BALI, TIRTA, { at: at(17, '10:00') });
    expect(at10.days.map((day) => day.day_no)).toEqual([5]);
    expect(at10.days[0]?.grade).toBe('possible');
    expect(at10.days[0]?.slot?.starts_at).toBe(at(17, '10:00').toISOString());
    const early = fitPlace(BALI, TIRTA, { at: at(17, '06:00') });
    expect(early.days[0]?.grade).toBe('no');
  });
});
