/**
 * The Kyoto eight-day draft the design draws, as fixed data for the developer scenes: Pon's
 * crew of six, five must-dos, $1,310 each, and one redraft of day 4 (Nara out, no trains).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data (names, places, ids), never copy. */
import type { StayRow } from '@cp/domain';

import type { DayCard, StepRow } from '../data/job';
import type { DraftTrip } from '../data/draft-trip';
import type { ReviewDay, ReviewModel } from '../data/version';

export const TRIP_ID = '0199a6f0-0000-7000-8000-00000000d001';
export const TZ = 'Asia/Tokyo';
export const LOCALE_DATES = { start: '2027-04-02', end: '2027-04-09' } as const;

export const PEOPLE = [
  { uid: 'u-maya', name: 'Maya', joinIndex: 0 },
  { uid: 'u-alex', name: 'Alex', joinIndex: 1 },
  { uid: 'u-jordan', name: 'Jordan', joinIndex: 2 },
  { uid: 'u-rin', name: 'Rin', joinIndex: 3 },
  { uid: 'u-winston', name: 'Winston', joinIndex: 4 },
  { uid: 'u-dev', name: 'Dev', joinIndex: 5 },
] as const;
const [MAYA, ALEX, JORDAN, RIN, WINSTON, DEV] = PEOPLE;

export const at = (date: string, time: string) => `${date}T${time}:00+09:00`;
const stop = (name: string, date: string, time: string, locked = false) => ({
  name,
  startsAt: at(date, time),
  tz: TZ,
  locked,
});

export const DAYS: readonly ReviewDay[] = [
  {
    dayNo: 1,
    date: '2027-04-02',
    title: 'Nishiki at dusk',
    stops: [
      stop('Kyoto Station', '2027-04-02', '11:20', true),
      stop('Nishiki Market', '2027-04-02', '17:30'),
    ],
    owners: [],
    optional: false,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 2,
    date: '2027-04-03',
    title: 'Inari at 6am',
    stops: [
      stop('Fushimi Inari', '2027-04-03', '06:00'),
      stop('Tea ceremony', '2027-04-03', '15:00', true),
    ],
    owners: [MAYA],
    optional: false,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 3,
    date: '2027-04-04',
    title: 'Arashiyama at dawn',
    stops: [
      stop('Bamboo grove', '2027-04-04', '06:00', true),
      stop('Kaiseki lunch', '2027-04-04', '12:30'),
    ],
    owners: [RIN, JORDAN],
    optional: false,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 4,
    date: '2027-04-05',
    title: 'Nara deer',
    stops: [
      stop('Nara Park', '2027-04-05', '09:12'),
      stop('Tōdai-ji', '2027-04-05', '12:30'),
      stop('Shijo', '2027-04-05', '15:00'),
    ],
    owners: [],
    optional: true,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 5,
    date: '2027-04-06',
    title: 'Nothing. Bliss.',
    stops: [],
    owners: [],
    optional: false,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 6,
    date: '2027-04-07',
    title: 'Nintendo Museum',
    stops: [stop('Uji', '2027-04-07', '10:00', true)],
    owners: [ALEX],
    optional: false,
    closed: false,
    lottery: { action: 'lottery', date: '2027-03-01' },
  },
  {
    dayNo: 7,
    date: '2027-04-08',
    title: 'Pontocho at night',
    stops: [
      stop('Gion walk', '2027-04-08', '17:00'),
      stop('Pontocho alley dinner', '2027-04-08', '19:30', true),
    ],
    owners: [WINSTON],
    optional: false,
    closed: false,
    lottery: null,
  },
  {
    dayNo: 8,
    date: '2027-04-09',
    title: 'Fly home',
    stops: [stop('Kansai Airport', '2027-04-09', '18:40', true)],
    owners: [],
    optional: false,
    closed: false,
    lottery: null,
  },
];

const STAYS: readonly StayRow[] = [
  {
    stable_id: 's1',
    stay_type: 'ryokan',
    nights: 3,
    check_in: '2027-04-02',
    check_out: '2027-04-05',
    nightly_pp_minor: 9_500,
    currency: 'USD',
    free_cancel_until: null,
    booking_id: null,
    partners: ['agoda'],
  },
  {
    stable_id: 's2',
    stay_type: 'hotel',
    nights: 4,
    check_in: '2027-04-05',
    check_out: '2027-04-09',
    nightly_pp_minor: 7_000,
    currency: 'USD',
    free_cancel_until: '2027-03-20T00:00:00Z',
    booking_id: 'b1',
    partners: [],
  },
];

export const REVIEW: ReviewModel = {
  versionId: 'v-3',
  days: DAYS,
  mustDos: { total: 5, made: 5, owners: [MAYA, ALEX, JORDAN, RIN, WINSTON], missing: [] },
  costPpMinor: 131_000,
  currency: 'USD',
  overByMinor: 0,
  stays: [],
  closures: [],
  stale: [],
  lateMustDo: false,
  lateMustDoTitles: [],
};

/** The crew's flights from the wallet on the first and last day, as the server places them. */
export const REVIEW_BOOKED: ReviewModel = {
  ...REVIEW,
  days: DAYS.map((day) => {
    if (day.dayNo === 1) {
      const flight = stop('JL 221 · HND → ITM', day.date, '09:05', true);
      return { ...day, stops: [flight, ...day.stops], booked: true };
    }
    if (day.dayNo === DAYS.length) {
      return { ...day, stops: [stop('JL 228 · ITM → HND', day.date, '18:40', true)], booked: true };
    }
    return day;
  }),
};

export const REVIEW_MISSING: ReviewModel = {
  ...REVIEW,
  mustDos: {
    total: 5,
    made: 3,
    owners: [MAYA, JORDAN, RIN],
    missing: [
      { title: 'Nintendo Museum', owner: ALEX, reason: 'closed' },
      { title: 'Ramen crawl', owner: DEV, reason: 'no_time' },
    ],
  },
};

export const REVIEW_OVER: ReviewModel = { ...REVIEW, costPpMinor: 152_000, overByMinor: 12_000 };

export const REVIEW_STALE: ReviewModel = {
  ...REVIEW,
  stale: ['must_dos', 'budget'],
  lateMustDo: true,
  lateMustDoTitles: [],
};

export const REVIEW_DETAILS: ReviewModel = {
  ...REVIEW,
  days: DAYS.map((day) => (day.dayNo === 1 ? { ...day, closed: true } : day)),
  stays: STAYS,
  closures: [
    {
      poi_id: null,
      area: 'Nishiki Market',
      closed_from: '2027-04-02',
      closed_to: '2027-04-02',
      reason: 'Market holiday',
      source_url: 'https://www.kyoto-nishiki.or.jp/',
    },
  ],
};

export const TRIP: DraftTrip = {
  tripId: TRIP_ID,
  status: 'draft_review',
  destinationName: 'Kyoto',
  guide: 'pon',
  startDate: LOCALE_DATES.start,
  endDate: LOCALE_DATES.end,
  tz: TZ,
  draftVersionId: 'v-3',
  people: PEOPLE,
  organisers: [WINSTON],
  me: WINSTON.uid,
  isOrganiser: true,
  quota: { used: 1, limit: 3 },
  setup: {
    startDate: LOCALE_DATES.start,
    endDate: LOCALE_DATES.end,
    mustDoIds: [],
    budgetVersion: 1,
    roomsVersion: 1,
  },
};

const row = (
  id: string,
  status: StepRow['status'],
  label: StepRow['label'] = null,
  reason: string | null = null,
): StepRow => ({ id, status, label, reason });

export const STEPS_RUNNING: readonly StepRow[] = [
  row('read_profiles', 'done', { key: 'read_profiles', params: { n: 6 } }),
  row('check_season', 'done', { key: 'season', params: { signal: 'blossom forecast' } }),
  row('skeleton', 'done', { key: 'stays', params: { n: 2, stay_type: 'ryokan', area: 'Gion' } }),
  row('days', 'running'),
  row('validate', 'pending'),
  row('persist', 'pending'),
];

export const STEPS_PENDING: readonly StepRow[] = STEPS_RUNNING.map((step) => ({
  ...step,
  status: 'pending',
  label: null,
}));

export const STEPS_PARTIAL: readonly StepRow[] = STEPS_RUNNING.map((step) =>
  step.id === 'check_season'
    ? { ...step, status: 'failed', label: null, reason: 'model_unavailable' }
    : step.id === 'days'
      ? { ...step, status: 'done', label: { key: 'balance', params: { early: 3, late: 3 } } }
      : step,
);

export const STEPS_FAILED: readonly StepRow[] = STEPS_RUNNING.map((step) =>
  step.id === 'days' ? { ...step, status: 'failed', reason: 'no_places' } : step,
);

export const DAY_CARDS: readonly DayCard[] = DAYS.slice(0, 6).map((day) => ({
  dayNo: day.dayNo,
  theme: day.title,
  stops: day.stops.length,
}));
