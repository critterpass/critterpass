/**
 * A small town on a line for the day-sense tests: the ride between two places is the gap between
 * their positions in minutes, so a test can say how far apart things are in one glance.
 */
import type { Itinerary } from '@cp/domain';

import {
  bestOrder,
  dayWindow,
  scheduleDay,
  validateItinerary,
  type DayChoice,
  type DraftPoi,
  type DraftViolationCode,
  type TravelMatrix,
  type TripFrame,
} from '../../src/draft/index';

export const TZ = 'Asia/Ho_Chi_Minh';
export const id = (n: number) => `0199d000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export function place(
  n: number,
  name: string,
  category: string,
  extra: Partial<DraftPoi> = {},
): DraftPoi {
  return {
    id: id(n),
    name,
    category,
    lat: 16,
    lng: 108,
    tz: TZ,
    hours: null,
    priceLevel: null,
    tags: [],
    durationMin: category === 'food' ? 60 : 90,
    editorial: true,
    mustSee: false,
    ...extra,
  };
}

/** Places on a line: the ride between two is the gap between their positions, in minutes. */
export function line(positions: Readonly<Record<string, number>>): TravelMatrix {
  return (from, to) => {
    const a = positions[from];
    const b = positions[to];
    return a === undefined || b === undefined ? null : Math.abs(a - b);
  };
}

export const FRAME: TripFrame = {
  tz: TZ,
  currency: 'VND',
  dates: ['2026-10-19', '2026-10-20', '2026-10-21'],
  members: [id(900)],
  chronotypes: {},
  diets: [],
  arrivalMin: null,
  departureMin: null,
  budgetPpMinor: null,
  mustDos: [],
  closures: [],
};

export const EVENINGS = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
      day,
      [{ start: '17:00', end: '22:00' }],
    ]),
  ),
} as DraftPoi['hours'];

export const MIDDAYS = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
      day,
      [{ start: '10:30', end: '15:00' }],
    ]),
  ),
} as DraftPoi['hours'];

export const P = {
  museum: place(1, 'City Museum', 'museum'),
  pagoda: place(2, 'Old Pagoda', 'temple_shrine'),
  park: place(3, 'River Park', 'nature'),
  falls: place(4, 'Far Falls', 'nature'),
  lunch: place(5, 'Cơm Gà Bà Buội', 'food'),
  dinner: place(6, 'Bánh Xèo Bà Dưỡng', 'food', { hours: EVENINGS }),
  farLunch: place(7, 'Quán Bên Kia Đảo', 'food', { hours: MIDDAYS }),
  bar: place(8, 'Sky Bar', 'nightlife'),
  terraces: place(9, 'Rice Terraces', 'nature', { bestTime: 'Early morning to beat the heat' }),
  beach: place(10, 'West Beach', 'beach', { bestTime: 'At sunset' }),
};
export const POIS = new Map(Object.values(P).map((poi) => [poi.id, poi]));
export const NEAR = line({
  [P.museum.id]: 0,
  [P.pagoda.id]: 10,
  [P.park.id]: 20,
  [P.lunch.id]: 5,
  [P.dinner.id]: 15,
  [P.bar.id]: 12,
  [P.terraces.id]: 18,
  [P.beach.id]: 25,
  [P.falls.id]: 95,
  [P.farLunch.id]: 60,
});

export const MEAL_PLACES = [P.lunch, P.dinner, P.farLunch];

export const stop = (poi: DraftPoi, kind: DayChoice['kind'] = 'activity'): DayChoice => ({
  poiId: poi.id,
  kind,
  mustDoId: null,
  note: null,
});

/** The day as the planner times it: in its best order, or (`asGiven`) in the order given. */
export function drafted(
  dayIndex: number,
  choices: readonly DayChoice[],
  frame = FRAME,
  asGiven = false,
): Itinerary {
  const window = dayWindow(frame, dayIndex);
  const input = {
    date: frame.dates[dayIndex] as string,
    choices,
    pois: POIS,
    window,
    travel: NEAR,
  };
  const order = asGiven
    ? choices.map((_, index) => index)
    : bestOrder({ ...input, hopCapMin: 40, mealPlaces: MEAL_PLACES }).order;
  let next = 0;
  const day = scheduleDay({
    ...input,
    dayNo: dayIndex + 1,
    theme: 'A day',
    choices: order.map((index) => choices[index] as DayChoice),
    bands: null,
    currency: frame.currency,
    tz: frame.tz,
    idFor: () => id(1000 + (next += 1)),
  });
  return { currency: frame.currency, days: [day] };
}

export function codes(plan: Itinerary, frame = FRAME): DraftViolationCode[] {
  return validateItinerary({
    itinerary: plan,
    pois: POIS,
    frame,
    travel: NEAR,
    requiredMustDoIds: [],
    mealPlaces: MEAL_PLACES,
    hopCapMin: 40,
  }).violations.map((v) => v.code);
}

export const names = (plan: Itinerary) =>
  (plan.days[0]?.items ?? []).map((item) => POIS.get(item.poi_id ?? '')?.name);
