/**
 * The crews the blog benchmark drafts for, the made-up trip each one takes (two friends with the
 * same tastes, landing at eight on the first morning and leaving at half past nine on the last
 * evening, so every day is a full day like the blogs' days), and the drafted days read back as
 * scored stops.
 */
import type { DraftPlanInput } from '@cp/ai';
import type { Itinerary } from '@cp/domain';
import {
  datesOf,
  foodRole,
  instantAt,
  metresBetween,
  minuteOfDate,
  type DraftPoi,
} from '@cp/planner';

import type { DraftTripData } from '../../src/jobs/ai/draft/load';
import { matchPlace, nearestArea } from './match';
import type { Reference } from './reference';
import type { ScoredDay, ScoredStop } from './score';

export interface Crew {
  readonly id: string;
  readonly tastes: readonly string[];
  /** How the judge is told about the crew. */
  readonly brief: string;
}

export const CREWS: readonly Crew[] = [
  { id: 'neutral', tastes: [], brief: 'two friends on a first visit, no particular tastes' },
  {
    id: 'culture',
    tastes: ['culture', 'history', 'museums', 'temples'],
    brief: 'two friends who love culture, history, museums and temples',
  },
  {
    id: 'foodie',
    tastes: ['street_food', 'markets'],
    brief: 'two friends travelling for street food and markets',
  },
  {
    id: 'nightlife',
    tastes: ['nightlife', 'late_starts'],
    brief: 'two friends who like nightlife and sleep in',
  },
  {
    id: 'nature',
    tastes: ['nature', 'easy_pace', 'quiet_evenings'],
    brief: 'two friends who want nature, an easy pace and quiet evenings',
  },
];

/** A curated row's rank names its line in the places file; a line farther off was rewritten since. */
const RANK_LINK_M = 2_000;

const LANDS_MIN = 8 * 60;
const LEAVES_MIN = 21 * 60 + 30;

export interface Destination {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly tz: string;
  readonly guideSlug: string | null;
  readonly languages: readonly string[];
}

/** The first Friday at least three weeks out: the same dates for every run of the same week. */
export function defaultStart(today: Date): string {
  const at = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  at.setUTCDate(at.getUTCDate() + 21);
  while (at.getUTCDay() !== 5) at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

const uid = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export function crewTrip(
  destination: Destination,
  crew: Crew,
  start: string,
  days: number,
): DraftTripData {
  const dates = datesOf(start, days);
  const last = dates[dates.length - 1] ?? start;
  return {
    tripId: uid(900),
    crewId: uid(901),
    status: 'drafting',
    startDate: start,
    endDate: last,
    tz: destination.tz,
    currency: 'USD',
    destinationId: destination.id,
    destination: [destination.name, destination.country].filter(Boolean).join(', '),
    guideSlug: destination.guideSlug,
    members: ['Mai', 'Leo'].map((name, i) => ({ uid: uid(i + 1), name, tastes: crew.tastes })),
    mustDos: [],
    diets: [],
    dietsBy: [],
    budget: null,
    rooms: null,
    bands: null,
    languages: destination.languages,
    transport: [
      { startsAt: null, endsAt: instantAt(start, LANDS_MIN, destination.tz).toISOString() },
      { startsAt: instantAt(last, LEAVES_MIN, destination.tz).toISOString(), endsAt: null },
    ],
  };
}

function scoredStop(
  item: Itinerary['days'][number]['items'][number],
  date: string,
  poi: DraftPoi | undefined,
  reference: Reference,
  ranks: ReadonlyMap<string, number>,
): ScoredStop | null {
  if (poi === undefined) return null;
  const rank = ranks.get(poi.id);
  const line = rank === undefined ? undefined : reference.places.find((p) => p.index === rank - 1);
  const ref =
    line !== undefined && metresBetween(poi, line) <= RANK_LINK_M
      ? line
      : matchPlace(poi, reference.places);
  const role = ref?.meal_role ?? foodRole(poi);
  return {
    poiId: poi.id,
    name: poi.name,
    kind: item.kind,
    startMin: minuteOfDate(new Date(item.starts_at), date, item.tz),
    lat: poi.lat,
    lng: poi.lng,
    category: ref?.category ?? poi.category,
    tags: [...new Set([...(ref?.tags ?? []), ...poi.tags])],
    bestTimes: ref?.best_times ?? poi.bestTimes ?? [],
    mealRole: role ?? null,
    area: ref?.area ?? nearestArea(poi, reference.places),
    ref,
  };
}

/**
 * The drafted days as the benchmark scores them (stops without a place of ours are left out).
 * `ranks` holds each curated row's rank (its line in the places file, from 1).
 */
export function scoredDays(
  itinerary: Itinerary,
  input: DraftPlanInput,
  reference: Reference,
  ranks: ReadonlyMap<string, number>,
): ScoredDay[] {
  return itinerary.days.map((day) => ({
    dayNo: day.day_no,
    theme: day.theme,
    stops: day.items.flatMap((item) => {
      const stop = scoredStop(item, day.date, input.pois.get(item.poi_id ?? ''), reference, ranks);
      return stop === null ? [] : [stop];
    }),
  }));
}
