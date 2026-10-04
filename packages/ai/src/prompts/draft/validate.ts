/**
 * The planner's validator as every drafting stage calls it: the draft's places, frame and travel,
 * the meal places the crew can eat at (so a day without a lunch it could have had is a fault) and
 * the destination's hop cap.
 */
import type { Itinerary } from '@cp/domain';
import { validateItinerary, type ValidationResult } from '@cp/planner';

import { hopCap } from './areas';
import type { DraftPlanInput } from './context';

export function requiredMustDoIds(input: DraftPlanInput): string[] {
  return input.pools.mustDos.map((slot) => slot.mustDoId);
}

export function validate(input: DraftPlanInput, itinerary: Itinerary): ValidationResult {
  return validateItinerary({
    itinerary,
    pois: input.pois,
    frame: input.frame,
    travel: input.travel,
    requiredMustDoIds: requiredMustDoIds(input),
    mealPlaces: input.pools.eateries,
    hopCapMin: hopCap(input),
  });
}
