/**
 * The places list's groups (7c-3): "SAVED, NOT IN A DAY", "IN THE PLAN" (one collapsed row) and
 * "TOKEK SUGGESTS", each in the chosen order: by fit for the trip's days (the server's ranking for
 * suggestions when it has answered and tells places apart), nearest first from the stay, or A–Z.
 * While no fit order is known the suggestions run in the recommended order (the guide's picks
 * first), and the list says which order it is in.
 */
import type { PlaceFit } from '@cp/domain';

import { distanceMeters, fold, type Point } from '../map-model';
import { kindRank } from '../category';
import { passesFilter, type HubPlace, type PlacesFilter } from './places-model';

export type SortMode = 'fit' | 'nearest' | 'az';

const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;

/** Lower fits better: the best day's grade, then its detour; no fit known sorts last. */
export function fitRankOf(fit: PlaceFit | null | undefined): number {
  if (fit === null || fit === undefined) return 10_000;
  if (fit.best === null) return 5_000;
  const day = fit.days.find((entry) => entry.day_id === fit.best?.day_id);
  return GRADE_RANK[fit.best.grade] * 1_000 + Math.min(999, day?.detour_minutes ?? 500);
}

/** The order the list is really in, which its sort line names. */
export type ListOrder = 'fit' | 'picks' | 'nearest' | 'az';

/**
 * Whether the server's ranking orders anything: an answer whose places all fit equally well is in
 * no fit order (it falls back to names), so the list does not call it one.
 */
export function fitOrderKnown(
  suggestOrder: readonly string[] | null,
  fits: ReadonlyMap<string, PlaceFit>,
): boolean {
  if (suggestOrder === null || suggestOrder.length === 0) return false;
  const first = fitRankOf(fits.get(suggestOrder[0] ?? ''));
  return suggestOrder.some((id) => fitRankOf(fits.get(id)) !== first);
}

export function listOrder(
  input: Pick<GroupsInput, 'sort' | 'suggestOrder' | 'fits' | 'ranks' | 'from'>,
): ListOrder {
  if (input.sort === 'az') return 'az';
  if (input.sort === 'nearest') return input.from === null ? 'az' : 'nearest';
  if (fitOrderKnown(input.suggestOrder, input.fits)) return 'fit';
  return input.ranks !== undefined && input.ranks.size > 0 ? 'picks' : 'az';
}

export interface GroupsInput {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly sort: SortMode;
  readonly fits: ReadonlyMap<string, PlaceFit>;
  /** The server's ranked suggestions; null before it answers (or offline). */
  readonly suggestOrder: readonly string[] | null;
  /** Where "nearest" is measured from: the stay, else the middle of the places. */
  readonly from: Point | null;
  /** Each place's standing in the recommended order (lower first); absent when not known. */
  readonly ranks?: ReadonlyMap<string, number> | undefined;
}

export interface PlaceGroups {
  readonly saved: readonly HubPlace[];
  readonly plan: readonly HubPlace[];
  readonly suggests: readonly HubPlace[];
}

const byName = (a: HubPlace, b: HubPlace) => {
  const left = fold(a.name);
  const right = fold(b.name);
  return left < right ? -1 : left > right ? 1 : 0;
};

const NO_FITS: ReadonlyMap<string, PlaceFit> = new Map();
const UNRANKED = Number.MAX_SAFE_INTEGER;

function sorted(
  places: readonly HubPlace[],
  order: ListOrder,
  fits: ReadonlyMap<string, PlaceFit>,
  from: Point | null,
  ranks: ReadonlyMap<string, number> | undefined,
): HubPlace[] {
  if (order === 'az') return [...places].sort(byName);
  if (order === 'nearest' && from !== null) {
    return [...places].sort(
      (a, b) => distanceMeters(from, a) - distanceMeters(from, b) || byName(a, b),
    );
  }
  const fit = (place: HubPlace) => fitRankOf(place.poiId === null ? null : fits.get(place.poiId));
  const pick = (place: HubPlace) => ranks?.get(place.poiId ?? place.id) ?? UNRANKED;
  // A fit that is known still leads (the crew's ideas carry theirs); the recommended order
  // settles the rest; where that ranks nothing, sights lead, and a tie keeps the catalogue's own
  // order (its ids), never the alphabet.
  const key = (place: HubPlace) => place.poiId ?? place.id;
  return [...places].sort(
    (a, b) =>
      fit(a) - fit(b) ||
      Number(b.mustSee) - Number(a.mustSee) ||
      pick(a) - pick(b) ||
      kindRank(a.category) - kindRank(b.category) ||
      (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0),
  );
}

export function placeGroups(input: GroupsInput): PlaceGroups {
  // One row per place, whatever handed the same place in twice.
  const seen = new Set<string>();
  const shown = input.places.filter((place) => {
    if (!passesFilter(place, input.filter) || seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
  const saved = shown.filter((place) => place.standing === 'saved');
  const plan = shown
    .filter((place) => place.standing === 'plan')
    .sort((a, b) => (a.dayNo ?? 0) - (b.dayNo ?? 0) || byName(a, b));
  const suggested = shown.filter((place) => place.standing === 'suggested');
  const order = listOrder(input);
  let suggests: HubPlace[];
  if (order === 'fit' && input.suggestOrder !== null) {
    // The server's ranking, each place once, only those still suggested on this phone.
    const byId = new Map(suggested.map((place) => [place.poiId ?? place.id, place]));
    suggests = [...new Set(input.suggestOrder)].flatMap((id) => {
      const place = byId.get(id);
      return place === undefined ? [] : [place];
    });
  } else {
    // In the picks order a fit known for a few suggestions must not lift them over the rest.
    suggests = sorted(
      suggested,
      order,
      order === 'picks' ? NO_FITS : input.fits,
      input.from,
      input.ranks,
    );
  }
  return {
    saved: sorted(saved, order, input.fits, input.from, input.ranks),
    plan,
    suggests,
  };
}
