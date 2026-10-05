/**
 * Hand-typed must-dos ("Marble Mountains at sunrise") turned into places before the lists are
 * built. One place named: it becomes the must-do's place for this draft, like a place picked from
 * search. Several different places named: all of them go on the guide's list and the wish stays a
 * wish. Nothing named: the wish stays unplaced. Curated places that only sit near the wished name
 * ("… - Cầu Rồng - Đà Nẵng") are offered too, never chosen.
 *
 * Open data pins one name in many places: a lone "Tirta Empul" a valley away from the temple, and
 * half a dozen rows around the temple itself. When the rows that carry a wished name crowd one
 * spot, that spot is the place the wish means, whatever row happens to match the words exactly.
 *
 * A wish may also name a dish, not a place ("mì Quảng for breakfast"). Where no curated place
 * carries the words as its own name, the curated eateries whose name leads with that dish are
 * what the wish may mean, and the guide picks one.
 */
import { dishOf, foodRole } from './food-role';
import { containsRun, matchWish, nameAliases, nameTokens } from './place-names';
import { collapseSamePlaces, metresBetween } from './same-place';
import type { DraftPoi } from './types';

/** How many places one unsettled wish may add to the guide's list. */
const MAX_OFFERED = 4;

export interface ResolvedWishes {
  /** Must-do id → the one place its text names. */
  readonly places: ReadonlyMap<string, string>;
  /** Places to put on the guide's list for wishes that name several, or sit near one. */
  readonly offered: readonly string[];
  /** Must-do id → every place the wish may mean (its own place first when it has one). */
  readonly options: ReadonlyMap<string, readonly string[]>;
}

/** Rows of one name within this distance of each other are one crowd. */
const CROWD_M = 400;
const MIN_CROWD = 3;

/**
 * The row at the spot most open-data rows carrying the wished name crowd around; null when the
 * wish names a curated place or food (a dish is sold on every street), or no spot stands out
 * (at least three rows, and twice as many as anywhere else).
 */
function crowdPlace(
  wish: string,
  named: readonly DraftPoi[],
  candidates: readonly DraftPoi[],
  ignore: readonly (readonly string[])[],
): DraftPoi | null {
  if (named.length === 0 || named.some((poi) => poi.editorial || poi.category === 'food')) {
    return null;
  }
  const text = nameTokens(wish);
  const primary = (poi: DraftPoi) => nameAliases(poi.name, ignore).primary;
  const name = named
    .flatMap(primary)
    .filter((alias) => containsRun(text, alias))
    .sort((a, b) => b.length - a.length)[0];
  if (name === undefined) return null;
  const rows = candidates.filter(
    (poi) =>
      !poi.editorial &&
      poi.category !== 'food' &&
      primary(poi).some((alias) => containsRun(alias, name)),
  );
  const crowds: DraftPoi[][] = [];
  for (const row of rows) {
    const near = crowds.filter((crowd) =>
      crowd.some((other) => metresBetween(row, other) <= CROWD_M),
    );
    const merged = [row, ...near.flat()];
    for (const crowd of near) crowds.splice(crowds.indexOf(crowd), 1);
    crowds.push(merged);
  }
  crowds.sort((a, b) => b.length - a.length);
  const [top, next] = crowds;
  if (top === undefined || top.length < MIN_CROWD || top.length < 2 * (next?.length ?? 0)) {
    return null;
  }
  const apart = (poi: DraftPoi) => top.reduce((sum, other) => sum + metresBetween(poi, other), 0);
  // The sight itself before the market or the car park that borrows its name.
  const beside = (poi: DraftPoi) =>
    Number(['market', 'shopping', 'stay', 'transit'].includes(poi.category));
  return (
    [...top].sort(
      (a, b) =>
        beside(a) - beside(b) ||
        nameTokens(a.name).length - nameTokens(b.name).length ||
        apart(a) - apart(b) ||
        (a.id < b.id ? -1 : 1),
    )[0] ?? null
  );
}

/** Curated meal places whose name leads with a dish the wish names, in the order given. */
function dishPlaces(wish: string, candidates: readonly DraftPoi[]): DraftPoi[] {
  const words = nameTokens(wish).map((word) => word.replaceAll('y', 'i'));
  const pairs = new Set(words.slice(1).map((word, index) => `${words[index] as string} ${word}`));
  return candidates.filter((poi) => {
    const dish = poi.editorial && foodRole(poi) === 'meal' ? dishOf(poi) : null;
    return dish !== null && pairs.has(dish);
  });
}

export function resolveWishes(
  wishes: readonly { readonly id: string; readonly text: string }[],
  candidates: readonly DraftPoi[],
  ignore: readonly (readonly string[])[] = [],
): ResolvedWishes {
  const places = new Map<string, string>();
  const offered: string[] = [];
  const options = new Map<string, string[]>();
  for (const wish of wishes) {
    const match = matchWish(wish.text, candidates, ignore);
    const crowd = crowdPlace(wish.text, match.named, candidates, ignore);
    const dishes = match.named.some((poi) => poi.editorial)
      ? []
      : dishPlaces(wish.text, candidates);
    const named =
      crowd !== null
        ? [crowd]
        : dishes.length > 0
          ? dishes
          : collapseSamePlaces(match.named, { ignore }).kept;
    const only = named.length === 1 ? named[0] : undefined;
    if (only !== undefined) places.set(wish.id, only.id);
    else offered.push(...named.slice(0, MAX_OFFERED).map((poi) => poi.id));
    const near = match.near.slice(0, MAX_OFFERED - 1).map((poi) => poi.id);
    offered.push(...near);
    options.set(wish.id, [...named.slice(0, MAX_OFFERED).map((poi) => poi.id), ...near]);
  }
  const taken = new Set(places.values());
  return {
    places,
    offered: [...new Set(offered)].filter((id) => !taken.has(id)),
    options,
  };
}
