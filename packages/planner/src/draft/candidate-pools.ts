/**
 * Candidate pools: from the prefetched places, the short lists the guide chooses from. Each
 * must-do's place with the days it is open (not shut by its hours or a cited closure); then
 * activities ranked by must-see, editorial curation and the crew's tastes; then meal places that
 * suit every diet in the crew. Places closed on every trip date never make a list. The guide sees
 * only these ids, so it cannot pick a place we do not know.
 */
import { closedOn, suitsDiet } from './validate-itinerary';
import { ceilGrid, dayWindow } from './schedule-day';
import { spansOn } from './sequence';
import type { DraftPoi, TripFrame } from './types';

/** Taste tag → place categories and tags it points at. */
const TASTE_MATCH: Readonly<Record<string, readonly string[]>> = {
  temples: ['temple_shrine'],
  culture: ['temple_shrine', 'museum'],
  history: ['museum', 'temple_shrine', 'history'],
  museums: ['museum'],
  markets: ['market'],
  shopping: ['shopping', 'market'],
  nature: ['nature'],
  hiking: ['nature', 'hiking'],
  beach: ['beach'],
  nightlife: ['nightlife'],
  photo_spots: ['photo_spot', 'viewpoint'],
  local_life: ['market', 'local_life'],
  wellness: ['wellness', 'onsen'],
  adventure: ['adventure', 'nature'],
  street_food: ['street_food'],
  sit_down_dining: ['sit_down'],
  coffee: ['coffee', 'cafe'],
};

export interface MustDoSlot {
  readonly mustDoId: string;
  readonly poiId: string;
  readonly openDays: readonly number[];
}

export interface CandidatePools {
  readonly mustDos: readonly MustDoSlot[];
  readonly unplaceable: readonly {
    readonly mustDoId: string;
    readonly reason: 'unknown_place' | 'closed';
  }[];
  readonly activities: readonly DraftPoi[];
  readonly meals: readonly DraftPoi[];
  /** Days (numbers) each pooled place can be visited on. */
  readonly openDays: ReadonlyMap<string, readonly number[]>;
}

export interface CandidatePoolsInput {
  readonly pois: readonly DraftPoi[];
  readonly frame: TripFrame;
  /** The crew's taste tags with how many members hold each. */
  readonly tastes: Readonly<Record<string, number>>;
}

/** A place can go on a day when a whole visit fits inside both its hours and the day's window. */
function openOnDay(poi: DraftPoi, frame: TripFrame, index: number): boolean {
  const date = frame.dates[index] as string;
  if (closedOn(frame, poi, date) === 'poi') return false;
  const window = dayWindow(frame, index);
  return spansOn(poi.hours, date).some(
    (span) =>
      Math.max(window.startMin, ceilGrid(span.start)) + ceilGrid(poi.durationMin) <=
      Math.min(window.endMin, span.end),
  );
}

function tasteScore(poi: DraftPoi, tastes: Readonly<Record<string, number>>): number {
  let score = 0;
  for (const [tag, count] of Object.entries(tastes)) {
    const targets = TASTE_MATCH[tag] ?? [];
    if (targets.includes(poi.category) || poi.tags.some((t) => targets.includes(t))) score += count;
  }
  return score;
}

function rank(pois: DraftPoi[], tastes: Readonly<Record<string, number>>): DraftPoi[] {
  const score = (poi: DraftPoi) =>
    (poi.mustSee ? 6 : 0) + (poi.editorial ? 4 : 0) + tasteScore(poi, tastes);
  return pois.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function candidatePools(input: CandidatePoolsInput): CandidatePools {
  const { frame } = input;
  const byId = new Map(input.pois.map((poi) => [poi.id, poi]));
  const openDays = new Map<string, number[]>();
  for (const poi of input.pois) {
    const days = frame.dates.flatMap((_, index) =>
      openOnDay(poi, frame, index) ? [index + 1] : [],
    );
    if (days.length > 0) openDays.set(poi.id, days);
  }
  const mustDos: MustDoSlot[] = [];
  const unplaceable: { mustDoId: string; reason: 'unknown_place' | 'closed' }[] = [];
  const mustDoPois = new Set<string>();
  for (const mustDo of frame.mustDos) {
    const poi = mustDo.poiId === null ? undefined : byId.get(mustDo.poiId);
    if (poi === undefined) {
      unplaceable.push({ mustDoId: mustDo.id, reason: 'unknown_place' });
      continue;
    }
    const days = openDays.get(poi.id);
    if (days === undefined) {
      unplaceable.push({ mustDoId: mustDo.id, reason: 'closed' });
      continue;
    }
    mustDos.push({ mustDoId: mustDo.id, poiId: poi.id, openDays: days });
    mustDoPois.add(poi.id);
  }
  const days = frame.dates.length;
  const open = input.pois.filter((poi) => openDays.has(poi.id) && !mustDoPois.has(poi.id));
  const activities = rank(
    open.filter(
      (poi) => poi.category !== 'food' && poi.category !== 'stay' && poi.category !== 'transit',
    ),
    input.tastes,
  ).slice(0, Math.min(48, Math.max(24, days * 6)));
  const meals = rank(
    open.filter(
      (poi) => poi.category === 'food' && frame.diets.every((diet) => suitsDiet(poi.tags, diet)),
    ),
    input.tastes,
  ).slice(0, Math.min(30, Math.max(12, days * 3)));
  return { mustDos, unplaceable, activities, meals, openDays };
}
