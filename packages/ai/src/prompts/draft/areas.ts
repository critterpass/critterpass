/**
 * Where places are, in words the guide can plan with. The guide never sees a coordinate, so
 * without this it cannot know that two museums are a street apart and the lunch it picked is
 * across the island. Code groups the places a draft may use into areas (every place within a
 * short ride of the area's first place), names each by a letter and its best-known places, and
 * tells the guide how far apart the areas are. Which stops may share a day is still checked by the
 * planner afterwards (the hop rule).
 */
import {
  homeBase,
  hopCapMin,
  partOfVisit,
  visitSpan,
  type DraftPoi,
  type VisitSpan,
} from '@cp/planner';

import type { DraftPlanInput } from './context';

export interface Areas {
  /** The area of a place; undefined for a place too far from every area. */
  readonly of: (poiId: string) => string | undefined;
  /** One line per area: its label, a few of its places, and the areas near it. */
  readonly lines: readonly string[];
  /** The same without place names, for a request that must not name places it does not offer. */
  readonly links: readonly string[];
  /** The longest ride between two stops of one day (the planner's hop cap). */
  readonly capMin: number;
}

interface Area {
  readonly label: string;
  readonly seed: DraftPoi;
  readonly places: DraftPoi[];
}

const AREAS = new WeakMap<object, Areas>();
const CAPS = new WeakMap<object, number>();

const label = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : `${label(Math.floor(index / 26) - 1)}${label(index % 26)}`;

function planned(input: Pick<DraftPlanInput, 'pools' | 'pois'>): DraftPoi[] {
  const mustDos = input.pools.mustDos.flatMap((slot) => {
    const poi = input.pois.get(slot.poiId);
    return poi === undefined ? [] : [poi];
  });
  return [...mustDos, ...input.pools.activities];
}

/**
 * The planner's hop cap for this draft (see `hopCapMin`), from every place we know in the
 * destination: the short lists are spread across it on purpose and would overstate its spacing.
 */
export function hopCap(input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>): number {
  const known = CAPS.get(input.pools);
  if (known !== undefined) return known;
  const cap = hopCapMin([...input.pois.values()], input.travel);
  CAPS.set(input.pools, cap);
  return cap;
}

const HOMES = new WeakMap<object, string | null>();

/** The place the crew most likely sleeps near (the planner's `homeBase`); null when unknown. */
export function homeOf(input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>): string | null {
  const known = HOMES.get(input.pools);
  if (known !== undefined) return known;
  const home = homeBase([...input.pois.values()], input.travel)?.id ?? null;
  HOMES.set(input.pools, home);
  return home;
}

export function areasOf(input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>): Areas {
  const cached = AREAS.get(input.pools);
  if (cached !== undefined) return cached;
  const capMin = hopCap(input);
  const reach = Math.round(capMin / 2);
  const areas: Area[] = [];
  const nearest = (poi: DraftPoi): Area | undefined => {
    let best: { area: Area; ride: number } | undefined;
    for (const area of areas) {
      const ride = input.travel(area.seed.id, poi.id) ?? Number.POSITIVE_INFINITY;
      if (ride <= reach && (best === undefined || ride < best.ride)) best = { area, ride };
    }
    return best?.area;
  };
  for (const poi of planned(input)) {
    const home = nearest(poi);
    if (home !== undefined) home.places.push(poi);
    else areas.push({ label: label(areas.length), seed: poi, places: [poi] });
  }
  const byPlace = new Map<string, string>();
  for (const area of areas) for (const poi of area.places) byPlace.set(poi.id, area.label);
  const lines = areas.map((area) => {
    const near = areas
      .filter((other) => other !== area)
      .map((other) => ({ other, ride: input.travel(area.seed.id, other.seed.id) ?? 0 }))
      .filter(({ ride }) => ride <= capMin)
      .sort((a, b) => a.ride - b.ride)
      .slice(0, 3)
      .map(({ other, ride }) => `${other.label} (${ride} min)`);
    const names = area.places.slice(0, 2).map((poi) => poi.name);
    const nearby = near.length > 0 ? near.join(', ') : 'no other area';
    return {
      line: `- Area ${area.label}: ${area.places.length} places, e.g. ${names.join('; ')} | near: ${nearby}`,
      link: `- Area ${area.label} | near: ${nearby}`,
    };
  });
  const made: Areas = {
    of: (poiId) => {
      const own = byPlace.get(poiId);
      if (own !== undefined) return own;
      const poi = input.pois.get(poiId);
      return poi === undefined ? undefined : nearest(poi)?.label;
    },
    lines: lines.map((entry) => entry.line),
    links: lines.map((entry) => entry.link),
    capMin,
  };
  AREAS.set(input.pools, made);
  return made;
}

/** How much of a day a visit to `poi` takes, the round trip from the stay included. */
export function spanOf(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  poi: DraftPoi,
): VisitSpan | null {
  const home = homeOf(input);
  return visitSpan(poi, home === null ? 0 : (input.travel(home, poi.id) ?? 0));
}

/** Whether the long visit to `anchor` takes in `poi` (./long-visits in the planner). */
export function insideVisit(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  poi: DraftPoi,
  anchor: DraftPoi,
): boolean {
  const home = homeOf(input);
  return partOfVisit(poi, anchor, home === null ? 0 : (input.travel(home, anchor.id) ?? 0));
}

/** The places of the day out day `dayNo` is planned for (./outings in the planner). */
export function dayOutOf(input: Pick<DraftPlanInput, 'pools'>, dayNo: number): ReadonlySet<string> {
  return new Set(
    input.pools.outings.filter((outing) => outing.dayNo === dayNo).flatMap((o) => o.poiIds),
  );
}
