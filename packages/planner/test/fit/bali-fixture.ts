/**
 * A Bali crew of six (Asia/Makassar, UTC+8) staying at a villa in Ubud, Tue 13 – Sun 18 Oct 2026,
 * with the facts the section 7 renders show: Tirta Empul opens at 08:00, is busy from 10:00 on a
 * Saturday, is 45 minutes' drive from the villa, and October mornings are dry. Wednesday is the
 * rice terraces in the morning, a cooking class for four and the spa for Maya and Rin, then
 * dinner at 19:30. Demo data only.
 */
import type { Hours } from '@cp/domain';

import type {
  FitContext,
  FitDay,
  FitItem,
  FitLeg,
  FitPlace,
  FitPoint,
  FitTravel,
} from '../../src/fit/index';

export const TZ = 'Asia/Makassar';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const MAYA = uid(1);
export const RIN = uid(2);
export const ALEX = uid(3);
export const KAI = uid(4);
export const LIN = uid(5);
export const SAM = uid(6);
export const CREW = [MAYA, RIN, ALEX, KAI, LIN, SAM];
export const FOUR = [ALEX, KAI, LIN, SAM];

export const DAY = (n: number) => uid(100 + n);
export const TERRACES = uid(201);
export const LUNCH = uid(202);
export const COOKING = uid(203);
export const SPA = uid(204);
export const DINNER = uid(205);
export const TIRTA_EMPUL = uid(301);
export const COFFEE = uid(302);
export const MARKET = uid(303);

export const VILLA: FitPoint = { lat: -8.5069, lng: 115.2625 };
export const POINTS = {
  tirta: { lat: -8.4153, lng: 115.3153 },
  terraces: { lat: -8.3709, lng: 115.1316 },
  warung: { lat: -8.372, lng: 115.133 },
  cooking: { lat: -8.51, lng: 115.26 },
  spa: { lat: -8.508, lng: 115.265 },
  dinner: { lat: -8.505, lng: 115.26 },
  coffee: { lat: -8.5075, lng: 115.2635 },
  market: { lat: -8.5068, lng: 115.2638 },
} as const;

/** Local Bali wall time on an October 2026 date → instant. */
export const at = (day: number, time: string) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${time}:00+08:00`);

const DAYS_OF_WEEK = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
export const daily = (start: string, end: string): Hours => ({
  weekly: Object.fromEntries(DAYS_OF_WEEK.map((day) => [day, [{ start, end }]])),
});

/** Minutes the fixture fixes; anything else is 20 minutes' drive. */
const LEGS: Readonly<Record<string, FitLeg>> = {
  [`stay>${TIRTA_EMPUL}`]: { minutes: 45, mode: 'drive', approx: false },
  [`${COOKING}>${TIRTA_EMPUL}`]: { minutes: 45, mode: 'drive', approx: false },
  [`${SPA}>${TIRTA_EMPUL}`]: { minutes: 45, mode: 'drive', approx: false },
  [`${LUNCH}>${TIRTA_EMPUL}`]: { minutes: 70, mode: 'drive', approx: false },
  [`${TERRACES}>${TIRTA_EMPUL}`]: { minutes: 75, mode: 'drive', approx: false },
  [`${COOKING}>${DINNER}`]: { minutes: 30, mode: 'drive', approx: false },
  [`${TERRACES}>${LUNCH}`]: { minutes: 5, mode: 'walk', approx: false },
};

export const fixtureTravel: FitTravel = (from, to) => {
  if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
  return (
    LEGS[`${from.key}>${to.key}`] ??
    LEGS[`${to.key}>${from.key}`] ?? { minutes: 20, mode: 'drive', approx: false }
  );
};

const item = (
  stableId: string,
  day: number,
  from: string,
  to: string,
  point: FitPoint,
  extra: Partial<FitItem> = {},
): FitItem => ({
  stableId,
  poiId: null,
  category: 'other',
  startsAt: at(day, from),
  endsAt: at(day, to),
  attendeeIds: [],
  locked: false,
  outdoor: false,
  point,
  ...extra,
});

/** October normals: dry mornings, afternoon showers. */
const OCTOBER_RAIN = Array.from({ length: 24 }, (_, hour) => (hour >= 13 && hour <= 17 ? 55 : 10));

const day = (n: number, date: number, items: FitItem[], extra: Partial<FitDay> = {}): FitDay => ({
  dayId: DAY(n),
  dayNo: n,
  date: `2026-10-${date}`,
  kind: 'full',
  fromMin: 7 * 60,
  toMin: 22 * 60,
  items,
  stay: VILLA,
  rain: { hourly: OCTOBER_RAIN, source: 'normals' },
  crowdFactor: 1,
  ...extra,
});

export const WEDNESDAY_ITEMS: FitItem[] = [
  item(TERRACES, 14, '07:30', '12:30', POINTS.terraces, { locked: true, outdoor: true }),
  item(LUNCH, 14, '12:30', '13:30', POINTS.warung),
  item(COOKING, 14, '13:30', '16:00', POINTS.cooking, { attendeeIds: FOUR }),
  item(SPA, 14, '14:00', '18:00', POINTS.spa, { attendeeIds: [MAYA, RIN], locked: true }),
  item(DINNER, 14, '19:30', '21:00', POINTS.dinner, { locked: true }),
];

export const BALI: FitContext = {
  tz: TZ,
  participants: CREW,
  driveFactor: 1.3,
  travel: fixtureTravel,
  days: [
    day(1, 13, [], { kind: 'arrival', fromMin: 15 * 60 }),
    day(2, 14, WEDNESDAY_ITEMS),
    day(3, 15, [item(uid(206), 15, '09:00', '17:00', POINTS.terraces, { locked: true })]),
    day(4, 16, [item(uid(207), 16, '08:00', '20:00', POINTS.terraces, { locked: true })]),
    day(5, 17, []),
    day(6, 18, [], { kind: 'departure', toMin: 9 * 60 }),
  ],
};

const flat = (level: number) => Array.from({ length: 24 }, () => level);
/** Saturday: quiet at the gates, busy from 10:00. Other days: steady. */
const SATURDAY_CROWDS = flat(0).map((_, hour) =>
  hour < 8 ? 0 : hour < 10 ? [20, 45][hour - 8]! : hour < 14 ? 90 : hour < 18 ? 50 : 0,
);

export const TIRTA: FitPlace = {
  poiId: TIRTA_EMPUL,
  point: POINTS.tirta,
  category: 'temple_shrine',
  hours: daily('08:00', '18:00'),
  timeNeededMin: 90,
  outdoor: true,
  crowds: {
    source: 'editorial',
    week: [flat(40), flat(40), flat(40), flat(40), flat(40), flat(40), SATURDAY_CROWDS],
  },
};
