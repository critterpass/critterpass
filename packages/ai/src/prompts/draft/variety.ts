/**
 * Variety in a day and across a trip. A day carries at most three stops of one kind (four temples
 * in a row is a day nobody remembers) as long as places of another kind are on its list; and when
 * the planner picks a place itself, it takes a must-see before the rest, and among equals a kind
 * the day lacks, then one that suits the crew's tastes, then the kind the day has least of, then a
 * kind the trip has not had yet.
 */
import { foodRole, tasteScore, type DraftPoi } from '@cp/planner';

import { earnsYield, mustSeeYields } from './agreement';
import type { DraftPlanInput } from './context';

/** Stops of one kind a day carries while other kinds are on offer. */
export const MAX_SAME_KIND = 3;

/** What a stop counts as for variety: its category, with every coffee or snack stop one kind. */
export function kindOf(poi: DraftPoi): string {
  return foodRole(poi) === 'light' ? 'break' : poi.category;
}

function counts(input: Pick<DraftPlanInput, 'pois'>, ids: readonly string[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const id of ids) {
    const poi = input.pois.get(id);
    if (poi === undefined || foodRole(poi) === 'meal') continue;
    found.set(kindOf(poi), (found.get(kindOf(poi)) ?? 0) + 1);
  }
  return found;
}

/** Whether adding `poi` to a day holding `dayIds` would be one of its kind too many. */
export function oneTooMany(
  input: Pick<DraftPlanInput, 'pois'>,
  dayIds: readonly string[],
  poi: DraftPoi,
): boolean {
  return (counts(input, dayIds).get(kindOf(poi)) ?? 0) >= MAX_SAME_KIND;
}

/**
 * Where a candidate stands before kinds and tastes: a must-see first, but one that may give way
 * for the crew (./agreement) after the places pages agree on that suit it.
 */
function tierOf(input: Pick<DraftPlanInput, 'tastes' | 'firstVisit'>, poi: DraftPoi): number {
  if (poi.mustSee) return mustSeeYields(input, poi) ? 2 : 0;
  return earnsYield(input, poi) ? 1 : 3;
}

/**
 * `candidates` in the order the planner should try them for a day holding `dayIds` on a trip
 * holding `tripIds`: must-sees first, then kinds the day lacks, then places that suit the crew's
 * tastes, then kinds the day has least of, then kinds new to the trip, then as they came. One of a
 * kind too many is left out while another kind is offered.
 * `near` (lower first) comes before all of that: a place in the day's own areas before a
 * must-see across town.
 */
export function byVariety(
  input: Pick<DraftPlanInput, 'pois' | 'tastes' | 'firstVisit'>,
  candidates: readonly DraftPoi[],
  dayIds: readonly string[],
  tripIds: readonly string[],
  near: (poi: DraftPoi) => number = () => 0,
): DraftPoi[] {
  const inDay = counts(input, dayIds);
  const inTrip = counts(input, tripIds);
  const ranked = candidates
    .map((poi, rank) => ({
      poi,
      rank,
      near: near(poi),
      day: inDay.get(kindOf(poi)) ?? 0,
      taste: tasteScore(poi, input.tastes) > 0 ? 0 : 1,
      seen: inTrip.has(kindOf(poi)) ? 1 : 0,
      tier: tierOf(input, poi),
    }))
    .sort(
      // Among must-sees the order they came in stands (the caller ranks them); the rest by kind.
      (a, b) =>
        a.near - b.near ||
        a.tier - b.tier ||
        (a.poi.mustSee ? a.rank - b.rank : 0) ||
        Math.min(a.day, 1) - Math.min(b.day, 1) ||
        a.taste - b.taste ||
        a.day - b.day ||
        a.seen - b.seen ||
        a.rank - b.rank,
    );
  const fresh = ranked.filter((entry) => entry.day < MAX_SAME_KIND);
  return (fresh.length > 0 ? fresh : ranked).map((entry) => entry.poi);
}
