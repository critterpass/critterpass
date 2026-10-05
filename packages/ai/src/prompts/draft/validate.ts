/**
 * The planner's validator as every drafting stage calls it: the draft's places, frame and travel,
 * the meal places the crew can eat at (so a day without a lunch it could have had is a fault) and
 * the destination's hop cap.
 */
import type { Itinerary } from '@cp/domain';
import { validateItinerary, type ValidationResult } from '@cp/planner';

import { homeOf, hopCap } from './areas';
import type { DraftPlanInput } from './context';

export function requiredMustDoIds(input: DraftPlanInput): string[] {
  return input.pools.mustDos.map((slot) => slot.mustDoId);
}

/** Checks already made, per input and draft: the planner's own passes ask about the same draft often. */
const CHECKED = new WeakMap<DraftPlanInput, WeakMap<Itinerary, ValidationResult>>();

export function validate(input: DraftPlanInput, itinerary: Itinerary): ValidationResult {
  const known = CHECKED.get(input) ?? new WeakMap<Itinerary, ValidationResult>();
  CHECKED.set(input, known);
  const before = known.get(itinerary);
  if (before !== undefined) return before;
  const result = validateItinerary({
    itinerary,
    pois: input.pois,
    frame: input.frame,
    travel: input.travel,
    requiredMustDoIds: requiredMustDoIds(input),
    mealPlaces: input.pools.eateries,
    hopCapMin: hopCap(input),
    homeId: homeOf(input),
    outings: input.pools.outings,
  });
  known.set(itinerary, result);
  return result;
}
