/**
 * A three-day Kyoto trip for the draft planner suites: four members (two early birds), one
 * vegetarian, five must-dos, places with real-shaped opening hours and a small travel matrix.
 */
import type { DraftItem, Itinerary } from '@cp/domain';

import {
  dayWindow,
  scheduleDay,
  type CostBands,
  type DayChoice,
  type DraftPoi,
  type TravelMatrix,
  type TripFrame,
} from '../../src/draft/index';

const TZ = 'Asia/Tokyo';
let seq = 0;
export const uuid = (n: number) => `0199a0f2-0000-7000-8000-${String(n).padStart(12, '0')}`;
const nextId = () => uuid(1000 + (seq += 1));

const hours = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start, end }]]),
  ),
});

function poi(n: number, name: string, category: string, extra: Partial<DraftPoi> = {}): DraftPoi {
  return {
    id: uuid(n),
    name,
    category,
    lat: 35,
    lng: 135.7,
    tz: TZ,
    hours: null,
    priceLevel: 2,
    tags: [],
    durationMin: category === 'food' ? 75 : 90,
    editorial: true,
    mustSee: false,
    ...extra,
  };
}

export const P = {
  fushimi: poi(1, 'Fushimi Inari', 'temple_shrine', { priceLevel: 0, mustSee: true }),
  kinkakuji: poi(2, 'Kinkaku-ji', 'temple_shrine', { hours: hours('09:00', '17:00') }),
  nishiki: poi(3, 'Nishiki Market', 'market', { hours: hours('10:00', '18:00') }),
  gion: poi(4, 'Gion walk', 'other', { priceLevel: 0 }),
  arashiyama: poi(5, 'Arashiyama Bamboo Grove', 'nature', { priceLevel: 0 }),
  kiyomizu: poi(6, 'Kiyomizu-dera', 'temple_shrine', { hours: hours('06:00', '18:00') }),
  museum: poi(7, 'Kyoto National Museum', 'museum', { hours: hours('09:30', '17:00') }),
  ramen: poi(8, 'Menya Inoichi', 'food', { tags: ['vegetarian_options'] }),
  shojin: poi(9, 'Shigetsu', 'food', { tags: ['vegan'], priceLevel: 3 }),
  yakitori: poi(10, 'Torito', 'food', { tags: [] }),
  tofu: poi(11, 'Okutan', 'food', { tags: ['vegetarian'] }),
  philosopher: poi(12, "Philosopher's Path", 'nature', { priceLevel: 0 }),
} as const;

export const POIS: ReadonlyMap<string, DraftPoi> = new Map(Object.values(P).map((p) => [p.id, p]));

export const MEMBERS = [uuid(901), uuid(902), uuid(903), uuid(904)];

export const MUST_DOS = [
  { id: uuid(501), ownerId: MEMBERS[0] as string, poiId: P.fushimi.id, title: 'Fushimi Inari' },
  { id: uuid(502), ownerId: MEMBERS[1] as string, poiId: P.kinkakuji.id, title: 'Kinkaku-ji' },
  { id: uuid(503), ownerId: MEMBERS[2] as string, poiId: P.nishiki.id, title: 'Nishiki' },
  { id: uuid(504), ownerId: MEMBERS[3] as string, poiId: P.arashiyama.id, title: 'Bamboo' },
  { id: uuid(505), ownerId: MEMBERS[0] as string, poiId: P.kiyomizu.id, title: 'Kiyomizu' },
] as const;

export const FRAME: TripFrame = {
  tz: TZ,
  currency: 'USD',
  dates: ['2026-11-02', '2026-11-03', '2026-11-04'],
  members: MEMBERS,
  chronotypes: { [MEMBERS[0] as string]: 'early_bird', [MEMBERS[1] as string]: 'early_bird' },
  diets: ['vegetarian'],
  arrivalMin: 10 * 60,
  departureMin: 20 * 60,
  budgetPpMinor: 40_000,
  mustDos: MUST_DOS,
  closures: [],
};

export const BANDS: CostBands = { foodPpDayMinor: 6000, funPpDayMinor: 4000 };

/** 20 minutes between any two places, 60 to and from Arashiyama. */
export const TRAVEL: TravelMatrix = (a, b) =>
  a === b ? 0 : a === P.arashiyama.id || b === P.arashiyama.id ? 60 : 20;

const pick = (p: DraftPoi, mustDoId: string | null = null, note: string | null = null) =>
  ({
    poiId: p.id,
    kind: p.category === 'food' ? 'meal' : 'activity',
    mustDoId,
    note,
  }) satisfies DayChoice;

export const CHOICES: readonly (readonly DayChoice[])[] = [
  [pick(P.kiyomizu, uuid(505)), pick(P.tofu), pick(P.gion)],
  [
    pick(P.fushimi, uuid(501)),
    pick(P.nishiki, uuid(503)),
    pick(P.ramen),
    pick(P.kinkakuji, uuid(502)),
    pick(P.shojin),
  ],
  [pick(P.arashiyama, uuid(504)), pick(P.philosopher)],
];

export const THEMES = ['Higashiyama slopes', 'Shrines and markets', 'Bamboo morning'];

export function schedule(dayIndex: number, choices: readonly DayChoice[]) {
  const date = FRAME.dates[dayIndex] as string;
  return scheduleDay({
    dayNo: dayIndex + 1,
    date,
    theme: THEMES[dayIndex] as string,
    choices,
    pois: POIS,
    window: dayWindow(FRAME, dayIndex),
    travel: TRAVEL,
    bands: BANDS,
    currency: 'USD',
    tz: TZ,
    idFor: () => nextId(),
  });
}

export function itinerary(): Itinerary {
  return { currency: 'USD', days: CHOICES.map((choices, index) => schedule(index, choices)) };
}

export const REQUIRED = MUST_DOS.map((m) => m.id);

export function itemFor(plan: Itinerary, poiId: string): DraftItem {
  const found = plan.days.flatMap((d) => d.items).find((i) => i.poi_id === poiId);
  if (found === undefined) throw new Error(`no item for ${poiId}`);
  return found;
}
