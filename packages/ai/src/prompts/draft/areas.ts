/**
 * Where places are, in words the guide can plan with. The guide never sees a coordinate, so
 * without this it cannot know that two museums are a street apart and the lunch it picked is
 * across the island. Code groups the places a draft may use into areas (the destination's named
 * areas where researchers placed them, else every place within a short ride of the area's first
 * place), names each by a letter, its name and its best-known places, and
 * tells the guide how far apart the areas are. Which stops may share a day is still checked by the
 * planner afterwards (the hop rule).
 */
import {
  homeBase,
  hopCapMin,
  metresBetween,
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
  /** The destination's own name for the area, where its places carry one (`DraftPoi.area`). */
  readonly name: string | null;
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
  // Places the researchers put in a named area of the destination share it: the named areas are
  // laid out first, then every other place joins the nearest area within reach, or starts one.
  const all = planned(input);
  for (const poi of all) {
    const name = poi.area ?? null;
    if (name === null) continue;
    const named = areas.find((area) => area.name === name);
    if (named !== undefined) named.places.push(poi);
    else areas.push({ label: label(areas.length), name, seed: poi, places: [poi] });
  }
  for (const poi of all) {
    if ((poi.area ?? null) !== null) continue;
    const home = nearest(poi);
    if (home !== undefined) home.places.push(poi);
    else areas.push({ label: label(areas.length), name: null, seed: poi, places: [poi] });
  }
  const byPlace = new Map<string, string | undefined>();
  for (const area of areas) for (const poi of area.places) byPlace.set(poi.id, area.label);
  // Any other place (an eatery, a sight off the lists) is in the area of the listed place nearest
  // it on the map, within reach: the neighbourhood it sits in, not the centre of a wide area. Ride
  // minutes are too coarse for this in a compact centre, where every place is a few minutes away.
  const nearestListed = (poi: DraftPoi): string | undefined => {
    let best: { label: string; metres: number } | undefined;
    for (const area of areas) {
      for (const place of area.places) {
        const metres = metresBetween(place, poi);
        if (best !== undefined && metres >= best.metres) continue;
        if ((input.travel(place.id, poi.id) ?? Number.POSITIVE_INFINITY) <= reach)
          best = { label: area.label, metres };
      }
    }
    return best?.label;
  };
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
      line: `- Area ${area.label}${area.name === null ? '' : ` (${area.name})`}: ${area.places.length} places, e.g. ${names.join('; ')} | near: ${nearby}`,
      link: `- Area ${area.label} | near: ${nearby}`,
    };
  });
  const made: Areas = {
    of: (poiId) => {
      if (byPlace.has(poiId)) return byPlace.get(poiId);
      const poi = input.pois.get(poiId);
      const found = poi === undefined ? undefined : nearestListed(poi);
      byPlace.set(poiId, found);
      return found;
    },
    lines: lines.map((entry) => entry.line),
    links: lines.map((entry) => entry.link),
    capMin,
  };
  AREAS.set(input.pools, made);
  return made;
}

/** A neighbouring area is a short ride away: a quarter of the hop cap. */
const NEIGHBOUR_SHARE = 0.25;

/**
 * How far `poiId` takes a day planned around `here` from its areas: 0 when it is in one of them,
 * 1 when it opens a second area a short ride from the day's stops, 2 otherwise (a third area, an
 * area across town, or no area). Itinerary pages keep a day in one area or two neighbouring ones;
 * the planner picks places in that order, and the nearest first when it must open another area.
 */
export function areaStep(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  poiId: string,
  here: readonly string[],
): number {
  const areas = areasOf(input);
  const held = areasHeld(
    input,
    here.filter((id) => id !== poiId),
  );
  const mine = areas.of(poiId);
  if (mine !== undefined && held.has(mine)) return 0;
  const neighbour = rideFrom(input, poiId, here) <= areas.capMin * NEIGHBOUR_SHARE;
  return mine !== undefined && held.size < 2 && neighbour ? 1 : 2;
}

/** The areas the places `here` are in. */
export function areasHeld(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  here: readonly string[],
): Set<string> {
  const areas = areasOf(input);
  return new Set(here.flatMap((id) => areas.of(id) ?? []));
}

/** The shortest ride from `poiId` to one of `here` (0 when `here` holds nothing else). */
export function rideFrom(
  input: Pick<DraftPlanInput, 'travel'>,
  poiId: string,
  here: readonly string[],
): number {
  const rides = here
    .filter((id) => id !== poiId)
    .map((id) => input.travel(id, poiId) ?? Number.POSITIVE_INFINITY);
  return rides.length === 0 ? 0 : Math.min(...rides);
}

/**
 * Whether `poiId` is a short ride from one of `here` (a quarter of the hop cap, as a neighbouring
 * area is): a named area can span a district, and the lunch at its far end is a ride of its own.
 */
export function besideStops(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  poiId: string,
  here: readonly string[],
): boolean {
  return rideFrom(input, poiId, here) <= areasOf(input).capMin * NEIGHBOUR_SHARE;
}

/**
 * Orders places for a day planned around `here`: its own areas first, those a short ride from
 * its stops before the rest of the area (best first within each, as they came), then a second
 * area, then the rest, each of those the nearest first.
 */
export function byArea<T extends { readonly id: string }>(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel'>,
  places: readonly T[],
  here: readonly string[],
): T[] {
  return places
    .map((place, rank) => {
      const step = areaStep(input, place.id, here);
      const ride = rideFrom(input, place.id, here);
      const far = step === 0 && ride > areasOf(input).capMin * NEIGHBOUR_SHARE ? 1 : 0;
      return { place, rank, step, far, ride: step === 0 ? 0 : ride };
    })
    .sort((a, b) => a.step - b.step || a.far - b.far || a.ride - b.ride || a.rank - b.rank)
    .map((entry) => entry.place);
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
