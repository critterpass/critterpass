/**
 * The check stage: the planner validates the whole draft, the guide redoes only the days that broke
 * a rule (two passes at most, those days in parallel), stops without a must-do give way before a
 * must-do does, and whatever still breaks a rule is dropped and shown as missing.
 */
import {
  validateAndRepair,
  type DraftModel,
  type DraftPlanInput,
  type RepairOutcome,
  type SkeletonPlan,
} from '@cp/ai';
import type { Itinerary } from '@cp/domain';

export function checkStage(
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: SkeletonPlan,
  drafted: Itinerary,
): Promise<RepairOutcome> {
  return validateAndRepair(model, input, skeleton, drafted);
}
