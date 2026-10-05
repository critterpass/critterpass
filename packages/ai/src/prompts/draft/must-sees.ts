/**
 * The places people come to a destination for. Our editors flag the must-sees; among them the
 * ones a trip should hold first are those that take the longest to see and sit nearest where the
 * crew stays (a mountain three hours long before a chapel of half an hour; the lake in town
 * before the reservoir an hour out). A trip's days are filled with these before anything else:
 * the outline is told to place them, the planner places the ones the guide left out, and a day
 * keeps the ones planned for it, so the same crew does not lose them from one draft to the next.
 */
import { foodRole, type DraftPoi } from '@cp/planner';

import { homeOf } from './areas';
import type { DraftPlanInput } from './context';

/** Core must-sees a day of the trip is worth. */
const CORE_PER_DAY = 5;

const CORE = new WeakMap<object, readonly string[]>();

/** The trip's core must-sees, the one to place first leading: ids of the pool's activities. */
export function coreMustSees(
  input: Pick<DraftPlanInput, 'pools' | 'pois' | 'travel' | 'frame'>,
): readonly string[] {
  const known = CORE.get(input.pools);
  if (known !== undefined) return known;
  const home = homeOf(input);
  const worth = (poi: DraftPoi) =>
    poi.durationMin - (home === null ? 0 : (input.travel(home, poi.id) ?? 0));
  const core = input.pools.activities
    .filter((poi) => poi.mustSee && foodRole(poi) === null)
    .map((poi, rank) => ({ poi, rank, worth: worth(poi) }))
    .sort((a, b) => b.worth - a.worth || a.rank - b.rank)
    .slice(0, input.frame.dates.length * CORE_PER_DAY)
    .map((entry) => entry.poi.id);
  CORE.set(input.pools, core);
  return core;
}
