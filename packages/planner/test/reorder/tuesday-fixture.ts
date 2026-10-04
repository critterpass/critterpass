/**
 * Tuesday 13 October in Ubud (the less driving render): the cooking class is booked 09:00-13:00,
 * Monkey Forest was planned for 12:00 (inside the class), then Taman Saraswati, Ubud market and
 * dinner at Warung Pondok. The order as planned spends 2h10 in the car; the best order 1h05.
 * Demo data only.
 */
import type { CheckInput } from '../../src/check/index';
import { DEFAULT_CHECK_THRESHOLDS } from '../../src/check/index';
import type { FitDay, FitItem, FitLeg, FitTravel } from '../../src/fit/index';
import { CREW, TZ, VILLA, at } from '../fit/bali-fixture';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const COOKING = uid(701);
export const FOREST = uid(702);
export const SARASWATI = uid(703);
export const MARKET = uid(704);
export const DINNER = uid(705);
export const TUESDAY = uid(801);

const point = (n: number) => ({ lat: VILLA.lat + n / 100, lng: VILLA.lng + n / 100 });

const LEGS: Readonly<Record<string, number>> = {
  [`stay>${COOKING}`]: 15,
  [`${COOKING}>${FOREST}`]: 20,
  [`${FOREST}>${MARKET}`]: 10,
  [`${MARKET}>${SARASWATI}`]: 5,
  [`${SARASWATI}>${DINNER}`]: 10,
  [`${DINNER}>stay`]: 5,
  [`${FOREST}>${SARASWATI}`]: 45,
};

/** The legs above either way; any other pair is 40 minutes' drive. */
export const tuesdayTravel: FitTravel = (from, to): FitLeg => {
  if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
  const minutes = LEGS[`${from.key}>${to.key}`] ?? LEGS[`${to.key}>${from.key}`] ?? 40;
  return { minutes, mode: 'drive', approx: false };
};

const item = (
  stableId: string,
  from: string,
  to: string,
  n: number,
  extra: Partial<FitItem> = {},
): FitItem => ({
  stableId,
  poiId: null,
  category: 'other',
  startsAt: at(13, from),
  endsAt: at(13, to),
  attendeeIds: [],
  locked: false,
  outdoor: false,
  point: point(n),
  ...extra,
});

export const TUESDAY_ITEMS: readonly FitItem[] = [
  item(COOKING, '09:00', '13:00', 1, { locked: true }),
  item(FOREST, '12:00', '13:00', 2, { outdoor: true }),
  item(SARASWATI, '14:00', '14:45', 3),
  item(MARKET, '15:00', '15:45', 4),
  item(DINNER, '19:00', '20:30', 5, { category: 'food' }),
];

export function tuesdayDay(items: readonly FitItem[] = TUESDAY_ITEMS): FitDay {
  return {
    dayId: TUESDAY,
    dayNo: 1,
    date: '2026-10-13',
    kind: 'full',
    fromMin: 7 * 60,
    toMin: 22 * 60,
    items,
    stay: VILLA,
    rain: null,
    crowdFactor: 1,
  };
}

export function tuesdayInput(day: FitDay = tuesdayDay()): CheckInput {
  return {
    context: { tz: TZ, participants: CREW, driveFactor: 1.3, travel: tuesdayTravel, days: [day] },
    places: new Map(),
    bookings: [],
    thresholds: DEFAULT_CHECK_THRESHOLDS,
    now: new Date('2026-10-01T09:00:00+08:00'),
  };
}
