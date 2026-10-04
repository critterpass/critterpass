/**
 * A Bali trip for the places lab scenes (7c-1…7c-3): a crew of five around a villa in Ubud, eight
 * days from Mon 12 Oct, three ideas saved and not placed, stops on days 2–4, and about seventy of
 * Tokek's curated places spread from a fixed seed, so every run draws the same map and list.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab fixture values, loaded only by the (dev) lab. */
import type { DayFit, FitReason, PlaceFit } from '@cp/domain';

import { routeDays, type PlanRouteDay, type RouteItem } from '../plan-routes';
import type { HubPlace } from '../places-model';
import type { CrewMember } from '../use-places-data';

export const LAB_TZ = 'Asia/Makassar';
export const LAB_TODAY = '2026-10-14';
export const VILLA = { name: 'villa', at: { lat: -8.515, lng: 115.258 } };

export const LAB_CREW: readonly CrewMember[] = [
  { uid: 'maya', name: 'Maya', joinIndex: 0 },
  { uid: 'jordan', name: 'Jordan', joinIndex: 1 },
  { uid: 'alex', name: 'Alex', joinIndex: 2 },
  { uid: 'rin', name: 'Rin', joinIndex: 3 },
  { uid: 'dewi', name: 'Dewi', joinIndex: 4 },
];

export const LAB_DAYS = Array.from({ length: 8 }, (_, index) => ({
  dayNo: index + 1,
  date: `2026-10-${String(12 + index)}`,
}));

const place = (
  id: string,
  name: string,
  category: string,
  lat: number,
  lng: number,
  extra: Partial<HubPlace> = {},
): HubPlace => ({
  id,
  poiId: id,
  ideaId: null,
  name,
  category,
  lat,
  lng,
  standing: 'suggested',
  backerIds: [],
  dayNo: null,
  mustSee: false,
  hours: null,
  bestTime: null,
  ...extra,
});

const OPEN = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [day, [{ start, end }]]),
  ),
});

const SAVED: readonly HubPlace[] = [
  place('tirta', 'Tirta Empul', 'temple_shrine', -8.4152, 115.3153, {
    standing: 'saved',
    backerIds: ['alex', 'rin'],
    ideaId: 'idea-tirta',
    hours: OPEN('08:00', '17:00'),
  }),
  place('seniman', 'Seniman Coffee', 'food', -8.5047, 115.2611, {
    standing: 'saved',
    backerIds: ['dewi'],
    ideaId: 'idea-seniman',
    hours: OPEN('07:00', '22:00'),
  }),
  place('lempuyang', 'Pura Lempuyang', 'temple_shrine', -8.3905, 115.6312, {
    standing: 'saved',
    backerIds: ['maya', 'jordan'],
    ideaId: 'idea-lempuyang',
  }),
];

/** Stops on days 2–4, in time order (`h` is the local start hour). */
const STOPS: readonly (readonly [string, string, string, number, number, number, number])[] = [
  ['monkey', 'Monkey Forest', 'nature', -8.5188, 115.2588, 2, 9],
  ['palace', 'Ubud Palace', 'museum', -8.5069, 115.2635, 2, 12],
  ['market', 'Ubud Night Market', 'market', -8.5101, 115.2669, 2, 18],
  ['jatiluwih', 'Jatiluwih', 'nature', -8.3706, 115.1316, 3, 8],
  ['biah', 'Biah Biah', 'food', -8.5068, 115.2636, 3, 12],
  ['karsa', 'Karsa Spa', 'health', -8.4948, 115.2511, 3, 15],
  ['campuhan', 'Campuhan Ridge', 'nature', -8.5031, 115.2543, 3, 17],
  ['batur', 'Mount Batur', 'nature', -8.2422, 115.3751, 4, 4],
  ['kintamani', 'Kintamani coffee', 'food', -8.2721, 115.3534, 4, 10],
];

const PLANNED: readonly HubPlace[] = STOPS.map(([id, name, category, lat, lng, dayNo]) =>
  place(id, name, category, lat, lng, { standing: 'plan', dayNo }),
);

const ROUTE_ITEMS: readonly RouteItem[] = STOPS.map(([id, name, , lat, lng, dayNo, hour]) => ({
  id,
  dayNo,
  name,
  lat,
  lng,
  startsAt: `2026-10-${String(11 + dayNo)}T${String(hour).padStart(2, '0')}:00:00+08:00`,
}));

export const LAB_ROUTES: readonly PlanRouteDay[] = routeDays(ROUTE_ITEMS, LAB_DAYS);

const NAMED: readonly HubPlace[] = [
  place('cepung', 'Tukad Cepung', 'nature', -8.4392, 115.3891, {
    bestTime: 'Light beams 09–10',
    mustSee: true,
  }),
  place('murni', "Murni's Warung", 'food', -8.5035, 115.2549, { bestTime: 'Open late' }),
  place('kawi', 'Gunung Kawi', 'temple_shrine', -8.4231, 115.3122, { mustSee: true }),
  place('goa', 'Goa Gajah', 'temple_shrine', -8.5234, 115.2871),
  place('tegallalang', 'Tegallalang', 'nature', -8.4312, 115.2793, { mustSee: true }),
  place('saraswati', 'Pura Taman Saraswati', 'temple_shrine', -8.5063, 115.2627),
  place('tibumana', 'Tibumana', 'nature', -8.4917, 115.3667),
  place('locavore', 'Locavore', 'food', -8.5089, 115.2632),
];

/** A small fixed-seed generator (mulberry32): the same places on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = ['food', 'temple_shrine', 'nature', 'food', 'shopping', 'museum', 'health'] as const;
const NAMES = ['Warung', 'Pura', 'Air Terjun', 'Kafe', 'Pasar', 'Museum', 'Spa'] as const;

function scattered(count: number): HubPlace[] {
  const random = seeded(7);
  return Array.from({ length: count }, (_, index) => {
    const r = 0.11 * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const kind = index % KINDS.length;
    return place(
      `lab-${String(index)}`,
      `${NAMES[kind] ?? 'Place'} ${String(index + 1)}`,
      KINDS[kind] ?? 'other',
      -8.48 + r * Math.sin(angle),
      115.28 + r * Math.cos(angle),
    );
  });
}

export const LAB_PLACES: readonly HubPlace[] = [...PLANNED, ...SAVED, ...NAMED, ...scattered(66)];

const reason = (code: string, params: Record<string, unknown> = {}) =>
  ({ code, params }) as unknown as FitReason;

function fitOn(
  poiId: string,
  dayNo: number,
  hour: number,
  reasons: readonly FitReason[] = [],
): PlaceFit {
  const date = LAB_DAYS[dayNo - 1]?.date ?? LAB_TODAY;
  const start = `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`;
  const day: DayFit = {
    day_id: `day-${String(dayNo)}`,
    day_no: dayNo,
    grade: 'good',
    slot: { starts_at: start, ends_at: start },
    reasons: [...reasons],
  };
  return {
    poi_id: poiId,
    best: {
      day_id: day.day_id,
      day_no: dayNo,
      grade: 'good',
      slot: { starts_at: start, ends_at: start },
    },
    days: [day],
  };
}

/** What the fit engine would answer for the lab's places (the lines the renders show). */
export const LAB_FITS: ReadonlyMap<string, PlaceFit> = new Map([
  ['tirta', fitOn('tirta', 6, 8)],
  [
    'seniman',
    fitOn('seniman', 3, 16, [reason('on_the_way', { stable_id: 'karsa', detour_minutes: 4 })]),
  ],
  ['lempuyang', fitOn('lempuyang', 5, 6, [reason('crew_split', { want: 2, rather_not: 2 })])],
  ['cepung', fitOn('cepung', 6, 9)],
  ['murni', fitOn('murni', 1, 19)],
  ['kawi', fitOn('kawi', 6, 10)],
  ['tegallalang', fitOn('tegallalang', 5, 8)],
  ['goa', fitOn('goa', 2, 14)],
]);
