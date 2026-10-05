import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  dayWindow,
  minuteOfDate,
  scheduleDay,
  timeFitsDay,
  timeWords,
  usualHours,
  validateItinerary,
  withOpenDataDefaults,
  type DayChoice,
  type TripFrame,
  type WishTime,
} from '../../src/draft/index';
import { heldWindow } from '../../src/draft/wish-time';
import { AUTO, D, FRAME, id } from './da-nang-fixture';
import { place } from './day-sense-fixture';

const daily = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [day, [{ start, end }]]),
  ),
});
/** Curated places with hours our editors entered. */
const GATED = {
  marble: {
    ...D.marble,
    id: id(131),
    name: 'Marble Mountains gate',
    hours: daily('07:00', '17:30'),
  },
  market: { ...D.hanMarket, id: id(132), name: 'Chợ Hàn', hours: daily('06:00', '19:00') },
  museum: { ...D.chamMuseum, id: id(133), name: 'Short museum', hours: daily('08:00', '12:00') },
};
/** Open-data places: their hours are only the usual ones of their kind. */
const GUESSED = {
  nightMarket: withOpenDataDefaults({
    ...D.conMarket,
    id: id(141),
    name: 'Chợ đêm Sơn Trà',
    editorial: false,
  }),
  beach: withOpenDataDefaults({
    ...D.myKheEn,
    id: id(142),
    name: 'Bãi Rạng',
    editorial: false,
    durationMin: 180,
  }),
  baNa: withOpenDataDefaults(AUTO.baNa),
};
const POIS = new Map(
  [
    D.marble,
    D.cauRong,
    D.myKhe,
    D.hanMarket,
    ...Object.values(GATED),
    ...Object.values(GUESSED),
  ].map((p) => [p.id, p]),
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
  const checked = validateItinerary({
    itinerary: { currency: 'VND', days: [day] },
    pois: POIS,
    frame,
    travel: TRAVEL,
    requiredMustDoIds: frame.mustDos.map((m) => m.id),
  });
  return {
    broken: order.broken,
    day,
    violations: checked.violations.map((v) => v.code),
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

  it('reads Vietnamese times of day with their tones, or without them inside a phrase', () => {
    expect(timeWords('ăn tối ở chợ Hàn')).toBe('evening');
    expect(timeWords('ngắm hoàng hôn ở Sơn Trà')).toBe('evening');
    expect(timeWords('cà phê buổi chiều')).toBe('afternoon');
    expect(timeWords('tắm biển buổi sáng')).toBe('morning');
    expect(timeWords('đi dạo ban đêm')).toBe('night');
    expect(timeWords('cho dem Son Tra')).toBe('night');
    expect(timeWords('binh minh o Son Tra')).toBe('sunrise');
  });

  it('does not read a time of day into words that only look like one without their tones', () => {
    // "tôi" (I), "tới" (to), "đem" (bring), "sang" (over to), "chiếu" (to screen), "Ánh Sáng" (a name).
    expect(timeWords('Tôi muốn ngắm cầu rồng phun lửa')).toBeNull();
    expect(timeWords('Đi tới Ngũ Hành Sơn')).toBeNull();
    expect(timeWords('Đem bánh mì lên Sơn Trà')).toBeNull();
    expect(timeWords('đi sang Hội An')).toBeNull();
    expect(timeWords('xem chiếu phim ngoài trời')).toBeNull();
    expect(timeWords('Cầu Ánh Sáng')).toBeNull();
    expect(timeWords('a late lunch at Madame Lân')).toBeNull();
  });

  it('reads a full day before any other time in the same words', () => {
    expect(timeWords('Tôi muốn đi Bà Nà cả ngày')).toBe('full_day');
    expect(timeWords('all day at Bà Nà, back by evening')).toBe('full_day');
  });
});

describe('a must-do held to its time of day', () => {
  it('starts at sunrise, before the usual day, and the rest waits for the usual start', () => {
    const m = mustDo(1, D.marble.id, 'sunrise');
    const plan = timed(frameWith([m]), 1, [
      choice(D.hanMarket.id),
      choice(D.marble.id, m.id, 'sunrise'),
    ]);
    expect(plan.broken).toBe(0);
    expect(plan.stops[0]).toMatchObject({ poiId: D.marble.id, start: 5 * 60 });
    // The crew's day starts at nine: nothing but the held stop is planned before it.
    expect(plan.stops[1]).toMatchObject({ poiId: D.hanMarket.id, start: 9 * 60 });
    expect(plan.violations).toEqual([]);
  });

  it('starts in the morning for a late-rising crew without pulling the next stop early', () => {
    const m = mustDo(5, D.marble.id, 'morning');
    const frame = { ...frameWith([m]), chronotypes: { [id(901)]: 'night_owl' as const } };
    const plan = timed(frame, 1, [choice(D.marble.id, m.id, 'morning'), choice(D.myKhe.id)]);
    expect(plan.stops[0]).toMatchObject({ poiId: D.marble.id, start: 8 * 60 });
    // The beach after it keeps to a beach's hours (from mid-afternoon), not to the early start.
    expect(plan.stops[1]).toMatchObject({ poiId: D.myKhe.id, start: 15 * 60 });
    expect(plan.violations).toEqual([]);
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

describe('a held time against the place’s opening hours', () => {
  it('waits for a curated place to open: a sunrise at a place that opens at seven is at seven', () => {
    const m = mustDo(11, GATED.marble.id, 'sunrise');
    const frame = frameWith([m]);
    expect(timeFitsDay(frame, 1, 'sunrise', GATED.marble)).toBe(true);
    const plan = timed(frame, 1, [
      choice(D.hanMarket.id),
      choice(GATED.marble.id, m.id, 'sunrise'),
    ]);
    expect(plan.stops[0]).toMatchObject({ poiId: GATED.marble.id, start: 7 * 60 });
    expect(plan.broken).toBe(0);
    expect(plan.violations).toEqual([]);
  });

  it('ends by closing time at a curated place: a night wish at a market that shuts at seven', () => {
    const m = mustDo(12, GATED.market.id, 'night');
    const frame = frameWith([m]);
    expect(timeFitsDay(frame, 1, 'night', GATED.market)).toBe(true);
    const plan = timed(frame, 1, [choice(D.myKhe.id), choice(GATED.market.id, m.id, 'night')]);
    // As near the wished time as the hours allow: the last visit that ends at closing.
    expect(plan.stops.at(-1)).toMatchObject({
      poiId: GATED.market.id,
      start: 17 * 60 + 30,
      end: 19 * 60,
    });
    expect(plan.broken).toBe(0);
    expect(plan.violations).toEqual([]);
  });

  it('cannot be held where the place is never open long enough for it', () => {
    // A full day needs six hours; this museum opens for four.
    expect(timeFitsDay(frameWith([]), 1, 'full_day', GATED.museum)).toBe(false);
  });

  it('keeps the wished time at an open-data place, whatever hours its kind usually keeps', () => {
    const cases = [
      { poi: GUESSED.nightMarket, when: 'night', start: 21 * 60 },
      { poi: GUESSED.beach, when: 'evening', start: 17 * 60 },
      { poi: GUESSED.baNa, when: 'sunrise', start: 5 * 60 },
    ] as const;
    for (const [n, { poi, when, start }] of cases.entries()) {
      const m = mustDo(20 + n, poi.id, when);
      const frame = frameWith([m]);
      expect(timeFitsDay(frame, 1, when, poi)).toBe(true);
      const plan = timed(frame, 1, [choice(poi.id, m.id, when)]);
      expect(plan.stops).toEqual([expect.objectContaining({ poiId: poi.id, start })]);
      expect(plan.broken).toBe(0);
      expect(plan.violations).toEqual([]);
    }
  });
});

describe('a timed must-do planned at another time', () => {
  it('is reported even when the stop sits inside the usual day', () => {
    const m = mustDo(31, D.marble.id, 'sunrise');
    const frame = frameWith([m]);
    // Planned like any other stop: at nine, the start of the usual day.
    const plan = timed(frame, 1, [choice(D.marble.id, m.id)]);
    expect(plan.stops[0]).toMatchObject({ start: 9 * 60 });
    expect(plan.violations).toEqual(['WRONG_TIME_OF_DAY']);
  });

  it('is not reported when the stop is on time', () => {
    const m = mustDo(32, D.cauRong.id, 'evening');
    const plan = timed(frameWith([m]), 1, [choice(D.cauRong.id, m.id, 'evening')]);
    expect(plan.stops[0]).toMatchObject({ start: 17 * 60 });
    expect(plan.violations).toEqual([]);
  });
});

describe('a trip with no flight times', () => {
  // The draft job passes none: landing is taken as half past twelve, take-off as three.
  const frame = { ...FRAME, mustDos: [] };

  it('holds a sunrise on the middle and the last day, never on the landing day', () => {
    expect([0, 1, 2].map((day) => timeFitsDay(frame, day, 'sunrise', D.marble))).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('holds a night show on any day but the last', () => {
    expect([0, 1, 2].map((day) => timeFitsDay(frame, day, 'night', D.cauRong))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('holds a full day on a middle day only', () => {
    expect([0, 1, 2].map((day) => timeFitsDay(frame, day, 'full_day', GUESSED.baNa))).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe('open-data places', () => {
  it('get the hours places of their kind keep, marked as a guess, and curated places keep their own', () => {
    expect(withOpenDataDefaults(AUTO.baNa)).toMatchObject({
      hours: usualHours('nature'),
      hoursGuessed: true,
    });
    expect(withOpenDataDefaults(D.marble).hours).toBeNull();
    expect(withOpenDataDefaults(D.marble).hoursGuessed).toBeUndefined();
    // Hours an open-data row brings itself are the place's own.
    const own = withOpenDataDefaults({ ...AUTO.baNa, hours: usualHours('museum') });
    expect(own.hoursGuessed).toBeUndefined();
  });

  it('are not put on the evening schedule when nothing holds them there', () => {
    const plan = timed(frameWith([]), 1, [choice(withOpenDataDefaults(AUTO.baNa).id)]);
    expect(plan.stops[0]?.end).toBeLessThanOrEqual(17 * 60 + 30);
  });
});

describe('a show at an hour our editors give', () => {
  const bridge = place(140, 'Dragon Bridge', 'museum', {
    bestTime: 'Saturday or Sunday evening before 9pm show',
  });

  it('holds an evening or night wish to that hour', () => {
    expect(heldWindow(bridge, '2026-10-24', 'evening')).toEqual({
      fromMin: 20 * 60 + 45,
      toMin: 21 * 60 + 15,
    });
    expect(
      heldWindow({ ...bridge, bestTime: 'The show starts at 21:00' }, '2026-10-24', 'night'),
    ).toEqual({ fromMin: 20 * 60 + 45, toMin: 21 * 60 + 15 });
    // Any other wish, or an hour that is not the evening's, keeps its time of day.
    expect(heldWindow(bridge, '2026-10-24', 'morning')?.fromMin).toBeLessThan(12 * 60);
    expect(
      heldWindow({ ...bridge, bestTime: 'Opens 7am' }, '2026-10-24', 'evening')?.fromMin,
    ).toBeLessThan(20 * 60);
  });
});
