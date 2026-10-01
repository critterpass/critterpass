/**
 * Hand-typed must-dos ("Marble Mountains at sunrise") turned into places before the lists are
 * built. One place named: it becomes the must-do's place for this draft, like a place picked from
 * search. Several different places named: all of them go on the guide's list and the wish stays a
 * wish. Nothing named: the wish stays unplaced. Curated places that only sit near the wished name
 * ("… - Cầu Rồng - Đà Nẵng") are offered too, never chosen.
 */
import { matchWish } from './place-names';
import { collapseSamePlaces } from './same-place';
import type { DraftPoi } from './types';

/** How many places one unsettled wish may add to the guide's list. */
const MAX_OFFERED = 4;

export interface ResolvedWishes {
  /** Must-do id → the one place its text names. */
  readonly places: ReadonlyMap<string, string>;
  /** Places to put on the guide's list for wishes that name several, or sit near one. */
  readonly offered: readonly string[];
}

export function resolveWishes(
  wishes: readonly { readonly id: string; readonly text: string }[],
  candidates: readonly DraftPoi[],
  ignore: readonly (readonly string[])[] = [],
): ResolvedWishes {
  const places = new Map<string, string>();
  const offered: string[] = [];
  for (const wish of wishes) {
    const match = matchWish(wish.text, candidates, ignore);
    const named = collapseSamePlaces(match.named, { ignore }).kept;
    const only = named.length === 1 ? named[0] : undefined;
    if (only !== undefined) places.set(wish.id, only.id);
    else offered.push(...named.slice(0, MAX_OFFERED).map((poi) => poi.id));
    offered.push(...match.near.slice(0, MAX_OFFERED - 1).map((poi) => poi.id));
  }
  const taken = new Set(places.values());
  return { places, offered: [...new Set(offered)].filter((id) => !taken.has(id)) };
}
