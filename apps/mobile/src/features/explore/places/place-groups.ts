/**
 * The places list's groups (7c-3): "SAVED, NOT IN A DAY", "IN THE PLAN" (one collapsed row) and
 * "TOKEK SUGGESTS", each in the chosen order: by fit for the trip's days (the server's ranking for
 * suggestions when it has answered), nearest first from the stay, or A–Z.
 */
import type { PlaceFit } from '@cp/domain';

import { distanceMeters, fold, type Point } from '../map-model';
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

export interface GroupsInput {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly sort: SortMode;
  readonly fits: ReadonlyMap<string, PlaceFit>;
  /** The server's ranked suggestions; null before it answers (or offline). */
  readonly suggestOrder: readonly string[] | null;
  /** Where "nearest" is measured from: the stay, else the middle of the places. */
  readonly from: Point | null;
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

function sorted(
  places: readonly HubPlace[],
  sort: SortMode,
  fits: ReadonlyMap<string, PlaceFit>,
  from: Point | null,
): HubPlace[] {
  if (sort === 'az') return [...places].sort(byName);
  if (sort === 'nearest' && from !== null) {
    return [...places].sort(
      (a, b) => distanceMeters(from, a) - distanceMeters(from, b) || byName(a, b),
    );
  }
  const rank = (place: HubPlace) => fitRankOf(place.poiId === null ? null : fits.get(place.poiId));
  return [...places].sort(
    (a, b) => rank(a) - rank(b) || Number(b.mustSee) - Number(a.mustSee) || byName(a, b),
  );
}

export function placeGroups(input: GroupsInput): PlaceGroups {
  const shown = input.places.filter((place) => passesFilter(place, input.filter));
  const saved = shown.filter((place) => place.standing === 'saved');
  const plan = shown
    .filter((place) => place.standing === 'plan')
    .sort((a, b) => (a.dayNo ?? 0) - (b.dayNo ?? 0) || byName(a, b));
  const suggested = shown.filter((place) => place.standing === 'suggested');
  let suggests: HubPlace[];
  if (input.sort === 'fit' && input.suggestOrder !== null) {
    // The server's ranking, each place once, only those still suggested on this phone.
    const byId = new Map(suggested.map((place) => [place.poiId ?? place.id, place]));
    suggests = [...new Set(input.suggestOrder)].flatMap((id) => {
      const place = byId.get(id);
      return place === undefined ? [] : [place];
    });
  } else {
    suggests = sorted(suggested, input.sort, input.fits, input.from);
  }
  return {
    saved: sorted(saved, input.sort, input.fits, input.from),
    plan,
    suggests,
  };
}
