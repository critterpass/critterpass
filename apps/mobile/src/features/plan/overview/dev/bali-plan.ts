/**
 * The Bali Six's week as the plan screens show it (3e-1, 3e-3): seven days from Monday 2 November,
 * each with the places, bookings and open votes of the design. The dev lab renders the screens
 * from it through the same model the app uses, and the tests seed it into the local database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the lab and tests. */
import type { OpenPollRow, WeatherRow } from '../data/plan-rows';
import type { PlanDay, PlanItem } from '../model/plan-model';

export const BALI_TRIP = '0199b000-0000-7000-8000-00000000b001';
export const BALI_CREW = '0199b000-0000-7000-8000-00000000c001';
export const BALI_VERSION = '0199b000-0000-7000-8000-00000000e001';
export const BALI_DESTINATION = '0199b000-0000-7000-8000-00000000d001';
export const BALI_TZ = 'Asia/Makassar';

export const WINSTON = '0199b000-0000-7000-8000-0000000000a1';
export const MAYA = '0199b000-0000-7000-8000-0000000000a2';
export const RIN = '0199b000-0000-7000-8000-0000000000a3';
export const JORDAN = '0199b000-0000-7000-8000-0000000000a4';
export const ALEX = '0199b000-0000-7000-8000-0000000000a5';
export const DEV = '0199b000-0000-7000-8000-0000000000a6';

export const BALI_MEMBERS = [
  { user_id: WINSTON, display_name: 'Winston' },
  { user_id: MAYA, display_name: 'Maya' },
  { user_id: RIN, display_name: 'Rin' },
  { user_id: JORDAN, display_name: 'Jordan' },
  { user_id: ALEX, display_name: 'Alex' },
  { user_id: DEV, display_name: 'Dev' },
] as const;

const EVERYONE = BALI_MEMBERS.map((member) => member.user_id);

export const BALI_DAYS: readonly PlanDay[] = [
  { dayNo: 1, date: '2026-11-02', theme: 'Arrive + pool' },
  { dayNo: 2, date: '2026-11-03', theme: 'Ubud centre' },
  { dayNo: 3, date: '2026-11-04', theme: 'Slow Ubud' },
  { dayNo: 4, date: '2026-11-05', theme: 'Batur sunrise' },
  { dayNo: 5, date: '2026-11-06', theme: 'Boat day' },
  { dayNo: 6, date: '2026-11-07', theme: 'Free day' },
  { dayNo: 7, date: '2026-11-08', theme: 'Uluwatu' },
];

function stable(n: number): string {
  return `0199b000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

interface Seed {
  readonly n: number;
  readonly day: number;
  readonly at: string;
  readonly until: string;
  readonly label: string;
  readonly category: string;
  readonly booking?: boolean;
  readonly lat: number;
  readonly lng: number;
  readonly who?: readonly string[];
  readonly amount?: number;
}

const SEEDS: readonly Seed[] = [
  {
    n: 101,
    day: 1,
    at: '03:40',
    until: '04:40',
    label: 'Driver',
    category: 'transit',
    booking: true,
    lat: -8.748,
    lng: 115.167,
  },
  {
    n: 102,
    day: 1,
    at: '07:00',
    until: '08:00',
    label: 'Villa check-in',
    category: 'stay',
    booking: true,
    lat: -8.506,
    lng: 115.262,
  },
  {
    n: 201,
    day: 2,
    at: '01:30',
    until: '04:00',
    label: 'Monkey Forest',
    category: 'nature',
    lat: -8.519,
    lng: 115.259,
    amount: 5_000,
  },
  {
    n: 202,
    day: 2,
    at: '07:00',
    until: '10:00',
    label: 'Cooking class',
    category: 'food',
    lat: -8.507,
    lng: 115.263,
    amount: 35_000,
  },
  {
    n: 301,
    day: 3,
    at: '23:00',
    until: '01:00',
    label: 'Terraces 7am',
    category: 'nature',
    lat: -8.434,
    lng: 115.279,
  },
  {
    n: 302,
    day: 3,
    at: '04:00',
    until: '06:00',
    label: 'Spa',
    category: 'health',
    lat: -8.51,
    lng: 115.26,
    who: [MAYA, RIN],
  },
  {
    n: 303,
    day: 3,
    at: '06:00',
    until: '08:30',
    label: 'Ridge walk',
    category: 'nature',
    lat: -8.503,
    lng: 115.254,
  },
  {
    n: 401,
    day: 4,
    at: '19:30',
    until: '03:00',
    label: 'Pickup',
    category: 'transit',
    booking: true,
    lat: -8.506,
    lng: 115.262,
  },
  {
    n: 402,
    day: 4,
    at: '03:30',
    until: '05:00',
    label: 'Hot springs',
    category: 'nature',
    lat: -8.276,
    lng: 115.4,
  },
  {
    n: 501,
    day: 5,
    at: '00:00',
    until: '09:00',
    label: 'Nusa Penida or Gili T?',
    category: 'beach',
    lat: -8.727,
    lng: 115.544,
  },
  {
    n: 701,
    day: 7,
    at: '03:00',
    until: '08:00',
    label: 'Beach clubs',
    category: 'beach',
    lat: -8.815,
    lng: 115.088,
  },
  {
    n: 702,
    day: 7,
    at: '10:00',
    until: '11:30',
    label: 'Kecak at sunset',
    category: 'temple_shrine',
    lat: -8.829,
    lng: 115.085,
  },
];

/** UTC instant of `hh:mm` UTC on the day before/of a plan date (the times above are UTC). */
function instant(day: number, hhmm: string, previous = false): string {
  const date = BALI_DAYS[day - 1]?.date ?? '2026-11-02';
  const base = new Date(`${date}T${hhmm}:00Z`);
  if (previous) base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString();
}

export const BALI_ITEMS: readonly PlanItem[] = SEEDS.map((seed) => {
  const overnight = seed.at > seed.until;
  return {
    stableId: stable(seed.n),
    dayNo: seed.day,
    startsAt: instant(seed.day, seed.at, overnight),
    endsAt: instant(seed.day, seed.until),
    tz: BALI_TZ,
    label: seed.label,
    category: seed.category,
    poiId: stable(seed.n + 5000),
    bookingId: seed.booking === true ? stable(seed.n + 9000) : null,
    mustDoId: null,
    lockedReason: seed.booking === true ? 'booking' : null,
    status: 'confirmed',
    byGuide: false,
    attendeeIds: seed.who ?? EVERYONE,
    lat: seed.lat,
    lng: seed.lng,
    amountMinor: seed.amount ?? null,
    currency: seed.amount === undefined ? null : 'USD',
    costModel: seed.amount === undefined ? null : 'per_person',
  };
});

export const BALI_POLLS: readonly OpenPollRow[] = [
  { id: stable(9901), ref_id: stable(5201), ballots: 1 },
  { id: stable(9902), ref_id: stable(5501), ballots: 0 },
];

function forecast(date: string, rain: number): WeatherRow {
  const day = {
    max_temp_c: 30,
    min_temp_c: 23,
    chance_of_rain: rain,
    precip_mm: rain / 10,
    uv: 8,
    code: 1000,
  };
  return { date, hourly: JSON.stringify({ day, hours: [] }), marine: null };
}

export const BALI_WEATHER: readonly WeatherRow[] = [
  forecast('2026-11-04', 80),
  forecast('2026-11-07', 10),
  forecast('2026-11-08', 5),
];
