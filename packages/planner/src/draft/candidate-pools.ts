/**
 * Candidate pools: from the prefetched places, the short lists the guide chooses from. Each
 * must-do's place with the days it is open (not shut by its hours or a cited closure); then
 * activities ranked by must-see, editorial curation and the crew's tastes; then meal places that
 * suit every diet in the crew. Places closed on every trip date never make a list. The guide sees
 * only these ids, so it cannot pick a place we do not know.
 *
 * Hundreds of curated places tie on that score, and only a few dozen fit a list, so what breaks
 * the tie decides the trip. It is never the alphabet: one row per place first (the curated set
 * lists some places several times), then the places listed most often, then a spread across
 * kinds of place and across the city (one market street cannot fill the list), and last the row
 * id, so the same input always gives the same lists.
 *
 * The head of the activities list is kept for the places everybody goes to: those the curated set
 * lists twice or more, most-listed first, up to a third of the list. A crew's taste tags lift
 * other places a point or two, and without this the sights a city is known for would lose their
 * seats to them unless somebody typed their names.
 */
import { collapseSamePlaces } from './same-place';
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
  /** Places that must be on a list when open (what a hand-typed must-do may mean). */
  readonly include?: readonly string[];
  /** Phrases naming the destination itself, ignored when comparing place names. */
  readonly ignoreNames?: readonly (readonly string[])[];
}

/** About a kilometre of city: places in one cell are neighbours. */
const CELL_DEG = 0.01;
const cellOf = (poi: DraftPoi) =>
  `${Math.floor(poi.lat / CELL_DEG)}:${Math.floor(poi.lng / CELL_DEG)}`;

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

interface Ranking {
  readonly tastes: Readonly<Record<string, number>>;
  readonly mentions: ReadonlyMap<string, number>;
  /** Places taken before any ranking. */
  readonly include: ReadonlySet<string>;
  /** Seats kept for the places listed twice or more, most-listed first (0 = none kept). */
  readonly wellKnown: number;
}

/**
 * The best `limit` places, picked one at a time: the highest score, then the place listed most
 * often, then the kind of place and the part of the city picked least so far, then the id. The
 * first `wellKnown` seats go to places listed twice or more, by how often before the score.
 */
function pick(pois: readonly DraftPoi[], limit: number, ranking: Ranking): DraftPoi[] {
  const score = new Map(
    pois.map((poi) => [
      poi.id,
      (poi.mustSee ? 6 : 0) + (poi.editorial ? 4 : 0) + tasteScore(poi, ranking.tastes),
    ]),
  );
  const picked: DraftPoi[] = [];
  const kinds = new Map<string, number>();
  const cells = new Map<string, number>();
  const take = (poi: DraftPoi) => {
    picked.push(poi);
    kinds.set(poi.category, (kinds.get(poi.category) ?? 0) + 1);
    cells.set(cellOf(poi), (cells.get(cellOf(poi)) ?? 0) + 1);
  };
  const rest = new Map(pois.map((poi) => [poi.id, poi]));
  for (const poi of pois) {
    if (ranking.include.has(poi.id)) {
      take(poi);
      rest.delete(poi.id);
    }
  }
  let kept = 0;
  while (picked.length < limit && rest.size > 0) {
    // While seats are kept and a place listed twice or more is left, only those compete.
    const known =
      kept < ranking.wellKnown
        ? [...rest.values()].filter((poi) => (ranking.mentions.get(poi.id) ?? 1) >= 2)
        : [];
    const field = known.length > 0 ? known : [...rest.values()];
    let best: DraftPoi | null = null;
    let bestKey: readonly number[] = [];
    for (const poi of field) {
      const listed = -(ranking.mentions.get(poi.id) ?? 1);
      const points = -(score.get(poi.id) ?? 0);
      const key = [
        ...(known.length > 0 ? [listed, points] : [points, listed]),
        kinds.get(poi.category) ?? 0,
        cells.get(cellOf(poi)) ?? 0,
      ];
      const order = best === null ? -1 : compare(key, bestKey) || (poi.id < best.id ? -1 : 1);
      if (order < 0) {
        best = poi;
        bestKey = key;
      }
    }
    if (best === null) break;
    if (known.length > 0) kept += 1;
    take(best);
    rest.delete(best.id);
  }
  return picked;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
  // One row per place. A must-do's own place stands for it, so no list offers it a second time.
  const places = collapseSamePlaces(
    input.pois.filter((poi) => openDays.has(poi.id)),
    { keep: mustDoPois, ignore: input.ignoreNames ?? [] },
  );
  const open = places.kept.filter((poi) => !mustDoPois.has(poi.id));
  const ranking: Ranking = {
    tastes: input.tastes,
    mentions: places.mentions,
    include: new Set(
      (input.include ?? []).flatMap((id) => {
        const kept = places.keptFor.get(id);
        return kept === undefined ? [] : [kept];
      }),
    ),
    wellKnown: 0,
  };
  const activityLimit = Math.min(48, Math.max(24, days * 6));
  const activities = pick(
    open.filter(
      (poi) => poi.category !== 'food' && poi.category !== 'stay' && poi.category !== 'transit',
    ),
    activityLimit,
    { ...ranking, wellKnown: Math.floor(activityLimit / 3) },
  );
  const meals = pick(
    open.filter(
      (poi) => poi.category === 'food' && frame.diets.every((diet) => suitsDiet(poi.tags, diet)),
    ),
    Math.min(30, Math.max(12, days * 3)),
    ranking,
  );
  return { mustDos, unplaceable, activities, meals, openDays };
}
