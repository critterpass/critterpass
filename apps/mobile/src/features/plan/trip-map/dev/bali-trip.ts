/**
 * The Bali Six's trip as the section 7 plan screens show it in the lab (7a-1…7a-3, 7b-1…7b-3):
 * eight days from Monday 12 October with the design's stops, bookings, votes and the plan check's
 * findings, the crew's saved places and the guide's picks around Ubud, built through the same
 * model the app reads (`buildTripDays`), so the lab draws what the screens draw, its routes along
 * recorded roads (bali-leg-shapes.ts).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { PlanCheckIssue, PlanState, PlanStateItem } from '@cp/domain';

import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';
import { instantOnDay, type ItemDisplay } from '@/data/plan/plan-model';

import { baliPlaces } from '../../../../ui/map/planning/dev/bali-fixture';
import type { TripMapModel } from '../sheet-props';
import { buildTripDays } from '../trip-days';
import { LAB_LEG_PATHS } from './bali-leg-shapes';
import { LAB_CREW, SEEDS, type Seed } from './bali-seeds';

const TZ = 'Asia/Makassar';
const TRIP = '0199c000-0000-7000-8000-00000000b001';
const uuid = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const [ME] = LAB_CREW;

const DAYS = [
  'Arrive + pool',
  'Ubud centre',
  'Slow Ubud',
  'Batur sunrise',
  'Boat day',
  'Free day',
  'Uluwatu',
  'Fly home',
] as const;
const dateOf = (dayNo: number) => `2026-10-${String(11 + dayNo).padStart(2, '0')}`;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function item(seed: Seed): PlanStateItem {
  const date = dateOf(seed.day);
  const start = minutesOf(seed.from);
  return {
    stable_id: uuid(seed.n),
    day_no: seed.day,
    starts_at: instantOnDay(date, start, TZ),
    ends_at: instantOnDay(date, start + seed.minutes, TZ),
    tz: TZ,
    attendee_ids: [...(seed.who ?? LAB_CREW.map((member) => member.uid))],
    poi_id: uuid(seed.n + 5000),
    booking_id: seed.booked === true ? uuid(seed.n + 9000) : null,
    category: seed.category ?? 'other',
    ...(seed.price === undefined ? {} : { amount_minor: seed.price, currency: 'IDR' }),
    ...(seed.booked === true ? { locked_reason: 'booking' as const } : {}),
    created_by_kind: 'user',
  };
}

const STATE: PlanState = {
  days: DAYS.map((theme, index) => ({ day_no: index + 1, date: dateOf(index + 1), theme })),
  items: SEEDS.map(item),
};
const DISPLAY = new Map<string, ItemDisplay>(
  SEEDS.map((seed) => [
    uuid(seed.n),
    { title: seed.name, place: { lat: seed.lat, lng: seed.lng } },
  ]),
);
const dayId = (dayNo: number) => uuid(700 + dayNo);

function issue(
  n: number,
  severity: 'fix' | 'know',
  dayNo: number | null,
  body: Pick<PlanCheckIssue, 'kind' | 'params'>,
  stableIds: readonly number[],
): PlanCheckIssue {
  return {
    ...body,
    id: uuid(900 + n),
    trip_id: TRIP,
    version_id: uuid(600),
    severity,
    day_id: dayNo === null ? null : dayId(dayNo),
    stable_ids: stableIds.map(uuid),
    fix:
      body.kind === 'rain'
        ? { kind: 'screen', screen: 'rain_crowds' }
        : body.kind === 'too_far'
          ? { kind: 'screen', screen: 'less_driving' }
          : null,
    rank: n,
    fingerprint: `lab-${String(n)}`,
  } as PlanCheckIssue;
}

const ISSUES: readonly PlanCheckIssue[] = [
  issue(
    1,
    'fix',
    2,
    { kind: 'clash', params: { first: uuid(201), second: uuid(202), short_minutes: 30 } },
    [201, 202],
  ),
  issue(
    2,
    'fix',
    3,
    {
      kind: 'rain',
      params: { stable_id: uuid(303), from: '13:00', to: '15:00', pct: 70, source: 'normals' },
    },
    [303],
  ),
  issue(
    3,
    'fix',
    7,
    {
      kind: 'too_far',
      params: { drive_minutes: 190, limit_minutes: 180, longest_leg_minutes: 95, after_dark: true },
    },
    [],
  ),
  issue(
    4,
    'know',
    2,
    {
      kind: 'crowds',
      params: {
        stable_id: uuid(202),
        level: 80,
        busy_from: '10:00',
        quiet_until: '09:00',
        source: 'editorial',
      },
    },
    [202],
  ),
  issue(5, 'know', null, { kind: 'pace', params: { stops: 5, limit: 6 } }, []),
];

const PLACES = baliPlaces(300);

function idea(index: number, backers: readonly string[]): TripIdeaView {
  const place = PLACES[index];
  return {
    id: uuid(3000 + index),
    poiId: uuid(4000 + index),
    name: place?.name ?? `Place ${String(index)}`,
    nameLocal: null,
    category: ['food', 'temple_shrine', 'nature'][index % 3] ?? 'other',
    lat: place?.lat ?? -8.5,
    lng: place?.lng ?? 115.26,
    backerIds: backers,
    sources: [],
    sourceUrl: null,
    fit: null,
  };
}

export function labTripModel(overrides: Partial<TripMapModel> = {}): TripMapModel {
  const days = buildTripDays({
    state: STATE,
    display: DISPLAY,
    dayRows: STATE.days.map((day) => ({ id: dayId(day.day_no), day_no: day.day_no })),
    themes: new Map(),
    tz: TZ,
    polls: [
      { id: uuid(9901), ref_id: uuid(302 + 5000), ballots: 4 },
      { id: uuid(9902), ref_id: uuid(501 + 5000), ballots: 2 },
    ],
    issues: ISSUES,
  });
  const crew = LAB_CREW.map((member) => member.uid);
  return {
    tripId: TRIP,
    destination: 'Bali',
    destinationSlug: 'bali',
    crewName: 'The Bali Six',
    tz: TZ,
    startDate: dateOf(1),
    endDate: dateOf(8),
    countdownTo: new Date(Date.now() + 17 * 86_400_000 - 3_600_000),
    days,
    legPaths: LAB_LEG_PATHS,
    members: LAB_CREW,
    me: ME.uid,
    organiser: true,
    draft: false,
    readOnly: false,
    guide: { id: 'tokek', name: 'Tokek' },
    check: { fixes: 3, know: 2, done: true },
    ideas: Array.from({ length: 8 }, (_, index) => idea(index, crew.slice(0, 1 + (index % 4)))),
    placedCount: 6,
    curated: PLACES.slice(14).map((place) => ({
      id: place.id,
      name: place.name,
      category: 'other',
      lat: place.lat,
      lng: place.lng,
    })),
    planned: new Set(SEEDS.map((seed) => uuid(seed.n + 5000))),
    reviews: [],
    regionUri: null,
    empty: false,
    center: [115.2625, -8.5069],
    ...overrides,
  };
}

/** The day after Bali won: no plan, nothing saved (7i-1). */
export function labEmptyModel(): TripMapModel {
  return labTripModel({
    days: [],
    ideas: [],
    placedCount: 0,
    planned: new Set(),
    check: { fixes: 0, know: 0, done: false },
    empty: true,
  });
}

/** Her own draft of the trip, checked, before the crew has seen any plan. */
export function labDraftModel(): TripMapModel {
  return labTripModel({ draft: true, draftStage: 'review' });
}

/**
 * The trip's days before any draft: dates locked, nothing placed yet, a few places saved to Ideas.
 * The days are hers to fill by hand, or for the guide to draft.
 */
export function labEmptyDaysModel(): TripMapModel {
  const full = labTripModel();
  return labTripModel({
    draft: true,
    draftStage: 'building',
    draftVersionId: uuid(9001),
    days: full.days.map((day) => ({
      ...day,
      theme: null,
      items: [],
      stops: [],
      pace: 0,
      vote: null,
      booked: false,
      issues: [],
      tag: null,
    })),
    ideas: full.ideas.slice(0, 3),
    placedCount: 0,
    planned: new Set(),
    check: { fixes: 0, know: 0, done: true },
  });
}

/** A member with places saved, before the organiser has shared any plan. */
export function labNoPlanYetModel(): TripMapModel {
  return { ...labEmptyModel(), organiser: false, ideas: labTripModel().ideas.slice(0, 3) };
}
