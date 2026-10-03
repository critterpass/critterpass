/**
 * The Bali trip of the plan check render: Tuesday's cooking class runs into Monkey Forest and the
 * day holds six stops in nine hours, Sunday is Uluwatu at sunset then dinner back in Ubud, the
 * ridge walk on Wednesday sits in October's wet afternoon, and Locavore NXT holds the table until
 * 1 October. Demo data only.
 */
import type { FitContext, FitDay, FitItem, FitTravel } from '../../src/fit/index';
import type { CheckInput } from '../../src/check/index';
import { DEFAULT_CHECK_THRESHOLDS } from '../../src/check/index';
import { CREW, VILLA, at } from '../fit/bali-fixture';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const BREAKFAST = uid(401);
export const COOKING = uid(402);
export const FOREST = uid(403);
export const LUNCH = uid(404);
export const TEMPLE = uid(405);
export const MARKET = uid(406);
export const RIDGE = uid(407);
export const ULUWATU = uid(408);
export const DINNER = uid(409);
export const LOCAVORE = uid(501);

const UBUD = VILLA;
const FAR = { lat: -8.829, lng: 115.085 };

const item = (
  stableId: string,
  day: number,
  from: string,
  to: string,
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
  point: UBUD,
  ...extra,
});

const day = (n: number, date: number, items: FitItem[], extra: Partial<FitDay> = {}): FitDay => ({
  dayId: uid(600 + n),
  dayNo: n,
  date: `2026-10-${date}`,
  kind: n === 1 ? 'arrival' : n === 8 ? 'departure' : 'full',
  fromMin: 7 * 60,
  toMin: 22 * 60,
  items,
  stay: UBUD,
  rain: null,
  crowdFactor: 1,
  ...extra,
});

/** Ubud to Uluwatu is two hours each way; everything else is a quarter of an hour. */
const travel: FitTravel = (from, to) => {
  if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
  const far = (from.lat === FAR.lat) !== (to.lat === FAR.lat);
  return { minutes: far ? 120 : 15, mode: 'drive', approx: false };
};

const wetAfternoons = Array.from({ length: 24 }, (_, hour) => (hour >= 13 && hour <= 15 ? 55 : 10));

export const BALI_CHECK_CONTEXT: FitContext = {
  tz: 'Asia/Makassar',
  participants: CREW,
  driveFactor: 1.3,
  travel,
  days: [
    day(1, 13, [
      item(BREAKFAST, 13, '08:30', '09:15'),
      item(COOKING, 13, '10:00', '13:00'),
      item(FOREST, 13, '12:00', '13:00'),
      item(LUNCH, 13, '13:30', '14:15'),
      item(TEMPLE, 13, '16:00', '16:45'),
      item(MARKET, 13, '17:00', '17:30'),
    ]),
    day(2, 14, [item(RIDGE, 14, '13:00', '15:00', { outdoor: true })], {
      rain: { hourly: wetAfternoons, source: 'normals' },
    }),
    day(3, 15, []),
    day(4, 16, []),
    day(5, 17, []),
    day(6, 18, [
      item(ULUWATU, 18, '17:00', '19:00', { point: FAR }),
      item(DINNER, 18, '21:00', '22:00', { locked: true }),
    ]),
    day(7, 19, []),
    day(8, 20, []),
  ],
};

export const BALI_CHECK: CheckInput = {
  context: BALI_CHECK_CONTEXT,
  places: new Map(),
  bookings: [
    { bookingId: LOCAVORE, deadline: new Date('2026-10-01T12:00:00+08:00'), kind: 'hold_expiry' },
  ],
  thresholds: DEFAULT_CHECK_THRESHOLDS,
  now: new Date('2026-09-28T09:00:00+08:00'),
};
