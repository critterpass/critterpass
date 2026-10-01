import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  dayWindow,
  minuteOfDate,
  scheduleDay,
  timeWords,
  usualHours,
  validateItinerary,
  withOpenDataDefaults,
  type DayChoice,
  type TripFrame,
  type WishTime,
} from '../../src/draft/index';
import { AUTO, D, FRAME, id } from './da-nang-fixture';

const POIS = new Map(
  [D.marble, D.cauRong, D.myKhe, D.hanMarket, withOpenDataDefaults(AUTO.baNa)].map((p) => [
    p.id,
    p,
  ]),
);
const TRAVEL = () => 20;

const mustDo = (n: number, poiId: string, when: WishTime) => ({
  id: id(700 + n),
  ownerId: id(901),
  poiId,
  title: 'typed',
  when,
});

function frameWith(
  mustDos: TripFrame['mustDos'],
  departureMin: number | null = 20 * 60,
): TripFrame {
  return { ...FRAME, arrivalMin: 8 * 60, departureMin, mustDos };
}

const choice = (
  poiId: string,
  mustDoId: string | null = null,
  when: DayChoice['when'] = null,
): DayChoice => ({
  poiId,
  kind: 'activity',
  mustDoId,
  note: null,
  when,
});

function timed(frame: TripFrame, dayIndex: number, choices: DayChoice[]) {
  const window = dayWindow(frame, dayIndex);
  const date = frame.dates[dayIndex] as string;
  const order = bestOrder({ date, choices, pois: POIS, window, travel: TRAVEL });
  const day = scheduleDay({
    dayNo: dayIndex + 1,
    date,
    theme: 'A day',
    choices: order.order.map((i) => choices[i] as DayChoice),
    pois: POIS,
    window,
    travel: TRAVEL,
    bands: null,
    currency: 'VND',
    tz: frame.tz,
    idFor: (c, i) => `${c.poiId}:${i}`,
  });
  const at = (iso: string) => minuteOfDate(new Date(iso), date, frame.tz);
  return {
    broken: order.broken,
    day,
    stops: day.items.map((item) => ({
      poiId: item.poi_id,
      start: at(item.starts_at),
      end: at(item.ends_at),
    })),
  };
}

describe('time words in a typed must-do', () => {
  it('reads sunrise, night, evening and a full day, in English and Vietnamese', () => {
    expect(timeWords('Marble Mountains at sunrise')).toBe('sunrise');
    expect(timeWords('ngắm bình minh ở Sơn Trà')).toBe('sunrise');
    expect(timeWords('night market')).toBe('night');
    expect(timeWords('chợ đêm Sơn Trà')).toBe('night');
    expect(timeWords('sunset drinks')).toBe('evening');
    expect(timeWords('Hội An day trip')).toBe('full_day');
  });

  it('reads nothing into a place name alone', () => {
    expect(timeWords('Marble Mountains')).toBeNull();
    expect(timeWords('cầu rồng phun lửa')).toBeNull();
    expect(timeWords('Bà Nà Hills')).toBeNull();
  });
});

describe('a must-do held to its time of day', () => {
  it('starts at sunrise, before the usual day, and the rest follows it', () => {
    const m = mustDo(1, D.marble.id, 'sunrise');
    const plan = timed(frameWith([m]), 1, [
      choice(D.hanMarket.id),
      choice(D.marble.id, m.id, 'sunrise'),
    ]);
    expect(plan.broken).toBe(0);
    expect(plan.stops[0]).toMatchObject({ poiId: D.marble.id, start: 5 * 60 });
    expect(plan.stops[1]?.start).toBeGreaterThanOrEqual(plan.stops[0]?.end ?? 0);
  });

  it('starts at nine at night and may run past the usual end of the day', () => {
    const m = mustDo(2, D.cauRong.id, 'night');
    const frame = frameWith([m]);
    const plan = timed(frame, 1, [choice(D.cauRong.id, m.id, 'night'), choice(D.myKhe.id)]);
    expect(plan.broken).toBe(0);
    expect(plan.stops.at(-1)).toMatchObject({ poiId: D.cauRong.id, start: 21 * 60 });
    const checked = validateItinerary({
      itinerary: { currency: 'VND', days: [plan.day] },
      pois: POIS,
      frame,
      travel: TRAVEL,
      requiredMustDoIds: [m.id],
    });
    expect(checked.violations.filter((v) => v.code === 'DAY_OVERRUN')).toEqual([]);
  });

  it('never runs into the flight home', () => {
    const m = mustDo(3, D.cauRong.id, 'night');
    // The last day: take-off at eight in the evening, so no night show that day.
    const plan = timed(frameWith([m]), 2, [choice(D.cauRong.id, m.id, 'night')]);
    expect(plan.broken).toBeGreaterThan(0);
  });

  it('gives a full-day place a block from the morning to the afternoon, in its usual hours', () => {
    const m = mustDo(4, AUTO.baNa.id, 'full_day');
    const plan = timed(frameWith([m]), 1, [choice(AUTO.baNa.id, m.id, 'full_day')]);
    expect(plan.broken).toBe(0);
    const [stop] = plan.stops;
    expect(stop?.start).toBeLessThanOrEqual(10 * 60);
    expect(stop?.end).toBeGreaterThanOrEqual(14 * 60);
  });
});

describe('open-data places', () => {
  it('get the hours places of their kind keep, and curated places keep their own', () => {
    expect(withOpenDataDefaults(AUTO.baNa).hours).toEqual(usualHours('nature'));
    expect(withOpenDataDefaults(D.marble).hours).toBeNull();
  });

  it('are not put on the evening schedule when nothing holds them there', () => {
    const plan = timed(frameWith([]), 1, [choice(withOpenDataDefaults(AUTO.baNa).id)]);
    expect(plan.stops[0]?.end).toBeLessThanOrEqual(17 * 60 + 30);
  });
});
