/**
 * An evening or night wish at a place that is for after dark (the fire show on the Dragon Bridge)
 * waits for the dark: a free stretch from five o'clock does not pull it into daylight.
 */
import { describe, expect, it } from 'vitest';

import {
  dayWindow,
  minuteOfDate,
  scheduleDay,
  sunsetMin,
  timeFitsDay,
  timeOfDayWindow,
  withTypedFacts,
  type DayChoice,
  type DraftPoi,
  type WishTime,
} from '../../src/draft/index';
import { FRAME, id, line, place, TZ } from './day-sense-fixture';

const SIGHT = place(1, 'Cham Museum', 'museum', { durationMin: 120 });
const BRIDGE = withTypedFacts(place(2, 'Cầu Rồng', 'landmark', { durationMin: 60 }), {
  profile: { bestTimes: ['after_dark'], visitMin: 60, mealRole: null, dish: null },
  editorsVisitMin: null,
  essentialRank: null,
});
const POIS = new Map<string, DraftPoi>([SIGHT, BRIDGE].map((poi) => [poi.id, poi]));
const DATE = FRAME.dates[1] as string;

/** A museum visit that ends by mid-afternoon, then the bridge wished for `when`. */
function bridgeStart(when: WishTime): number {
  const choices: DayChoice[] = [
    { poiId: SIGHT.id, kind: 'activity', mustDoId: null, note: null },
    { poiId: BRIDGE.id, kind: 'activity', mustDoId: id(500), note: null, when },
  ];
  let next = 0;
  const day = scheduleDay({
    dayNo: 2,
    date: DATE,
    theme: 'Han river',
    choices,
    pois: POIS,
    window: dayWindow(FRAME, 1),
    travel: line({ [SIGHT.id]: 0, [BRIDGE.id]: 10 }),
    bands: null,
    currency: FRAME.currency,
    tz: TZ,
    idFor: () => id(2000 + (next += 1)),
  });
  const item = day.items.find((i) => i.poi_id === BRIDGE.id);
  if (item === undefined) throw new Error('the bridge was not placed');
  return minuteOfDate(new Date(item.starts_at), DATE, TZ);
}

describe('an after-dark wish with an early-evening gap', () => {
  it('starts no earlier than the place is after dark, for an evening wish', () => {
    const dark = timeOfDayWindow('after_dark', BRIDGE, DATE).fromMin;
    expect(dark).toBeGreaterThan(17 * 60);
    expect(bridgeStart('evening')).toBeGreaterThanOrEqual(dark);
    expect(bridgeStart('evening')).toBeGreaterThan(sunsetMin(BRIDGE, DATE));
  });

  it('keeps a night wish at night', () => {
    expect(bridgeStart('night')).toBeGreaterThanOrEqual(21 * 60);
  });

  it('is not placed on a day that ends before the dark', () => {
    const early = { ...FRAME, departureMin: 21 * 60 + 30 };
    expect(timeFitsDay(early, early.dates.length - 1, 'evening', BRIDGE)).toBe(false);
    expect(timeFitsDay(early, 1, 'evening', BRIDGE)).toBe(true);
  });
});
