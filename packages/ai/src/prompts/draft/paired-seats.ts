/**
 * Two places our researchers pair (`pairsWith`) are one outing, and a day may have time for only
 * one of them (two sunset places on one shore). Then the one itinerary pages agree on more keeps
 * the seat, and among equals the one more pages hold: the pagoda six pages name before the lake
 * one page does, whichever the guide listed first.
 */
import { pairedPlaces } from '@cp/planner';

import { agreementOf } from './agreement';
import type { DraftPlanInput } from './context';

/** How far pages hold `poi`: agreement first (lower is more), then the pages that name it. */
function pagesRank(input: DraftPlanInput, id: string): readonly [number, number] {
  const poi = input.pois.get(id);
  return poi === undefined ? [3, 0] : [agreementOf(input, poi), -(poi.blogCount ?? 0)];
}

const before = (a: readonly [number, number], b: readonly [number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Puts `id` in the seat of a place in `kept` it pairs with that pages hold less, when the day then
 * still fits (`fits`), and returns the place it replaced; null when there is no such seat. An
 * essential never gives its seat up.
 */
export function intoPairedSeat(
  input: DraftPlanInput,
  kept: string[],
  id: string,
  fits: (ids: readonly string[]) => boolean,
): string | null {
  const poi = input.pois.get(id);
  if (poi === undefined) return null;
  for (const [at, other] of kept.entries()) {
    const was = input.pois.get(other);
    if (was === undefined || was.essential === true || !pairedPlaces(was, poi)) continue;
    if (!before(pagesRank(input, id), pagesRank(input, other))) continue;
    const next = kept.map((k, i) => (i === at ? id : k));
    if (!fits(next)) continue;
    kept.splice(at, 1, id);
    return other;
  }
  return null;
}
