/**
 * Places with typed facts are planned from them alone: from the pools to a timed and checked day,
 * nothing reads a place's text (the time-of-day words, a name read for food or a dish, a
 * must-do's words, a note checked against its stop). The same day from untyped places does read
 * them, so the spies are known to see the calls. Merging two listings of one place still compares
 * names until listings are merged where they are stored, so it is left out of the count here.
 */
import type { PlaceBestTime, PlaceMealRole } from '@cp/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as noteSense from '../../src/draft/note-sense';
import * as placeNames from '../../src/draft/place-names';
import * as placeTime from '../../src/draft/place-time';
import * as wishTime from '../../src/draft/wish-time';
import {
  bestOrder,
  candidatePools,
  dayWindow,
  earlyNeed,
  foodRole,
  homeBase,
  mealSlots,
  placeTime as timeOf,
  scheduleDay,
  sharesDish,
  stopKind,
  validateItinerary,
  withTypedFacts,
  type DayChoice,
  type DraftPoi,
} from '../../src/draft/index';
import { EVENINGS, FRAME, id, line, place } from './day-sense-fixture';

const spied = vi.hoisted(() => (actual: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === 'function' ? vi.fn(value as (...args: unknown[]) => unknown) : value,
    ]),
  );
});

vi.mock('../../src/draft/place-time', async (load) => spied(await load()));
vi.mock('../../src/draft/place-names', async (load) => spied(await load()));
vi.mock('../../src/draft/note-sense', async (load) => spied(await load()));
vi.mock('../../src/draft/same-place', async (load) => {
  const actual = await load<Record<string, unknown>>();
  return {
    ...actual,
    collapseSamePlaces: (pois: readonly DraftPoi[]) => ({
      kept: pois,
      mentions: new Map(),
      keptFor: new Map(pois.map((poi) => [poi.id, poi.id])),
    }),
  };
});
vi.mock('../../src/draft/wish-time', async (load) => {
  const actual = await load<Record<string, unknown>>();
  const wrapped = spied(actual);
  // Only its text readers are watched: the held windows are scheduling, not reading.
  return { ...actual, timeWords: wrapped['timeWords'], namedWeekdays: wrapped['namedWeekdays'] };
});

const READERS = [
  ...Object.values(placeTime),
  ...Object.values(placeNames),
  ...Object.values(noteSense),
  wishTime.timeWords,
  wishTime.namedWeekdays,
].filter((value) => vi.isMockFunction(value));
const readerCalls = () => READERS.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

interface Profile {
  readonly bestTimes?: readonly PlaceBestTime[];
  readonly mealRole?: PlaceMealRole;
  readonly dish?: string;
  readonly visitMin?: number;
}

const typed = (poi: DraftPoi, profile: Profile | null, essentialRank: number | null = null) =>
  withTypedFacts(poi, {
    profile:
      profile === null
        ? null
        : {
            bestTimes: profile.bestTimes ?? [],
            visitMin: profile.visitMin ?? null,
            mealRole: profile.mealRole ?? null,
            dish: profile.dish ?? null,
          },
    editorsVisitMin: null,
    essentialRank,
  });

// Text that the text readers would act on, and typed facts that say otherwise.
const PLAIN = {
  museum: place(1, 'City Museum', 'museum', { bestTime: 'Any time, best on a weekday' }),
  pagoda: place(2, 'Old Pagoda', 'temple_shrine', { bestTime: 'Early morning before 8am' }),
  noodles: place(5, 'Mì Quảng Bà Mua', 'food', { bestTime: 'Lunch' }),
  dinner: place(6, 'Bánh Xèo Bà Dưỡng', 'food', { hours: EVENINGS, bestTime: 'Dinner' }),
  coffee: place(7, 'Cộng Cà Phê', 'food', { durationMin: 45 }),
  bar: place(8, 'Sky Bar', 'nightlife', { bestTime: 'After dark for the view' }),
  beach: place(10, 'West Beach', 'beach', { bestTime: 'At sunset, Saturday nights' }),
};
const TYPED = {
  museum: typed(PLAIN.museum, null),
  pagoda: typed(PLAIN.pagoda, { bestTimes: ['early_morning', 'morning'], visitMin: 60 }, 1),
  noodles: typed(PLAIN.noodles, { mealRole: 'meal', dish: 'Mì Quảng', bestTimes: ['midday'] }),
  dinner: typed(PLAIN.dinner, { mealRole: 'meal', dish: 'bánh xèo', bestTimes: ['evening'] }),
  coffee: typed(PLAIN.coffee, { mealRole: 'light', bestTimes: ['morning', 'afternoon'] }),
  bar: typed(PLAIN.bar, { bestTimes: ['evening', 'after_dark'] }),
  beach: typed(PLAIN.beach, { bestTimes: ['early_morning', 'sunset'], visitMin: 120 }),
};
const ORDER = ['museum', 'pagoda', 'noodles', 'dinner', 'coffee', 'bar', 'beach'] as const;
const TRAVEL = line(Object.fromEntries(ORDER.map((key, at) => [PLAIN[key].id, at * 5])));

/** The draft path over `set`: pools, the order and times of a day, and its checks. */
function draftDay(set: Readonly<Record<(typeof ORDER)[number], DraftPoi>>) {
  const places = ORDER.map((key) => set[key]);
  const pois = new Map(places.map((poi) => [poi.id, poi]));
  const pools = candidatePools({ pois: places, frame: FRAME, tastes: {} });
  const choices: DayChoice[] = places.map((poi) => ({
    poiId: poi.id,
    kind: stopKind(poi),
    mustDoId: null,
    note: null,
  }));
  const window = dayWindow(FRAME, 1);
  const date = FRAME.dates[1] as string;
  const input = { date, choices, pois, window, travel: TRAVEL };
  const order = bestOrder({ ...input, hopCapMin: 60, mealPlaces: pools.eateries }).order;
  let next = 0;
  const day = scheduleDay({
    ...input,
    dayNo: 2,
    theme: 'A day',
    choices: order.map((at) => choices[at] as DayChoice),
    bands: null,
    currency: FRAME.currency,
    tz: FRAME.tz,
    idFor: () => id(2000 + (next += 1)),
  });
  const itinerary = { currency: FRAME.currency, days: [day] };
  const result = validateItinerary({
    itinerary,
    pois,
    frame: FRAME,
    travel: TRAVEL,
    requiredMustDoIds: [],
    mealPlaces: pools.eateries,
    hopCapMin: 60,
    homeId: homeBase(places, TRAVEL)?.id ?? null,
    outings: pools.outings,
  });
  for (const poi of places) {
    mealSlots(poi, date);
    earlyNeed(poi);
    timeOf(poi);
  }
  sharesDish(set.noodles, set.dinner);
  return { day, pools, result };
}

const startOf = (day: ReturnType<typeof draftDay>['day'], poi: DraftPoi) => {
  const item = day.items.find((i) => i.poi_id === poi.id);
  return item === undefined ? null : new Date(item.starts_at);
};

describe('a draft from typed places', () => {
  beforeEach(() => {
    for (const spy of READERS) spy.mockClear();
  });

  it('reads no place text anywhere on the draft path', () => {
    draftDay(TYPED);
    expect(readerCalls()).toBe(0);
  });

  it('reads the text when the places are not typed', () => {
    draftDay(PLAIN);
    expect(readerCalls()).toBeGreaterThan(0);
  });

  it('plans the day from the typed facts', () => {
    const { day, pools } = draftDay(TYPED);
    expect(foodRole(TYPED.coffee)).toBe('light');
    expect(pools.eateries.map((poi) => poi.id)).not.toContain(TYPED.coffee.id);
    // The bar is for after dark: never before sunset.
    const bar = startOf(day, TYPED.bar);
    expect(bar).not.toBeNull();
    expect((bar?.getUTCHours() ?? 0) + 7).toBeGreaterThanOrEqual(18);
    // An essential of the typed set ranks before the plain sights.
    expect(pools.activities[0]?.id).toBe(TYPED.pagoda.id);
  });
});
