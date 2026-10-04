/**
 * Wednesday 14 October in Bali (the rain and crowds render): Jatiluwih's terraces 09:00-12:00 run
 * into the tour buses from 10:00, the ridge walk at 14:00 sits in October's usual afternoon shower
 * (13:00-15:00), the spa follows at 16:00, lunch at 11:30 and dinner at 19:30 are booked.
 * Demo data only.
 */
import type { CheckInput, CheckPlace } from '../../src/check/index';
import { DEFAULT_CHECK_THRESHOLDS } from '../../src/check/index';
import type { FitDay, FitItem, FitLeg, FitTravel } from '../../src/fit/index';
import { CREW, TZ, VILLA, at, daily } from '../fit/bali-fixture';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const JATILUWIH = uid(901);
export const LUNCH = uid(902);
export const RIDGE = uid(903);
export const SPA = uid(904);
export const DINNER = uid(905);
export const JATILUWIH_POI = uid(951);
export const WEDNESDAY = uid(911);

const point = (n: number) => ({ lat: VILLA.lat + n / 100, lng: VILLA.lng - n / 100 });

/** Thirty minutes between the spa and the ridge, twenty everywhere else. */
export const wednesdayTravel: FitTravel = (from, to): FitLeg => {
  if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
  const pair = [from.key, to.key].sort().join('>');
  return {
    minutes: pair === [SPA, RIDGE].sort().join('>') ? 30 : 20,
    mode: 'drive',
    approx: false,
  };
};

/** October normals: showers 13:00-15:00 at 55 %, dry otherwise. */
export const OCTOBER_RAIN = Array.from({ length: 24 }, (_, hour) =>
  hour === 13 || hour === 14 ? 55 : 10,
);

/** A Wednesday at the terraces: quiet early, tour buses 10:00-15:00. */
const WEDNESDAY_CROWDS = Array.from({ length: 24 }, (_, hour) =>
  hour < 7 ? 0 : hour < 10 ? [20, 30, 50][hour - 7]! : hour < 15 ? 90 : hour < 18 ? 50 : 0,
);
const flat = Array.from({ length: 24 }, () => 30);

export const TERRACES: CheckPlace = {
  hours: daily('07:00', '18:00'),
  crowds: { source: 'editorial', week: [flat, flat, flat, WEDNESDAY_CROWDS, flat, flat, flat] },
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
  startsAt: at(14, from),
  endsAt: at(14, to),
  attendeeIds: [],
  locked: false,
  outdoor: false,
  point: point(n),
  ...extra,
});

export const WEDNESDAY_ITEMS: readonly FitItem[] = [
  item(JATILUWIH, '09:00', '12:00', 1, { poiId: JATILUWIH_POI, outdoor: true, category: 'nature' }),
  item(LUNCH, '12:30', '13:15', 2, { locked: true, category: 'food' }),
  item(RIDGE, '14:00', '16:00', 3, { outdoor: true, category: 'nature' }),
  item(SPA, '16:00', '18:00', 4),
  item(DINNER, '19:30', '21:00', 5, { locked: true, category: 'food' }),
];

export function wednesdayDay(items: readonly FitItem[] = WEDNESDAY_ITEMS): FitDay {
  return {
    dayId: WEDNESDAY,
    dayNo: 2,
    date: '2026-10-14',
    kind: 'full',
    fromMin: 7 * 60,
    toMin: 22 * 60,
    items,
    stay: VILLA,
    rain: { hourly: OCTOBER_RAIN, source: 'normals' },
    crowdFactor: 1,
  };
}

export function wednesdayInput(day: FitDay = wednesdayDay()): CheckInput {
  return {
    context: { tz: TZ, participants: CREW, driveFactor: 1.3, travel: wednesdayTravel, days: [day] },
    places: new Map([[JATILUWIH_POI, TERRACES]]),
    bookings: [],
    thresholds: DEFAULT_CHECK_THRESHOLDS,
    now: new Date('2026-10-01T09:00:00+08:00'),
  };
}
