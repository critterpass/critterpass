/**
 * The check stage: the planner validates the whole draft, the guide redoes only the days that broke
 * a rule (two passes at most, those days in parallel), stops without a must-do give way before a
 * must-do does, and whatever still breaks a rule is dropped and shown as missing. Stops the
 * organiser placed by hand are then put back where she placed them (./held-stops.ts).
 */
import {
  validateAndRepair,
  type DraftModel,
  type DraftPlanInput,
  type RepairOutcome,
  type SkeletonPlan,
} from '@cp/ai';
import type { Itinerary } from '@cp/domain';
import { holdStops, type HeldStop } from './held-stops';

export async function checkStage(
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: SkeletonPlan,
  drafted: Itinerary,
  held: readonly HeldStop[] = [],
): Promise<RepairOutcome> {
  const outcome = await validateAndRepair(model, input, skeleton, drafted);
  // The planner was given her stops and planned around them. Putting them back here, exactly as
  // she placed them, is the guarantee that holds whatever happened above.
  return { ...outcome, itinerary: holdStops(outcome.itinerary, held, input.travel).itinerary };
}

/**
 * What the check stage leaves on the job row beside the draft itself: whether the first check was
 * clean, what each pass found (code, day and place of every broken rule), how many stops the
 * planner dropped or added itself, and what still breaks a rule. It explains a draft afterwards.
 */
export function keptWithJob(outcome: RepairOutcome) {
  return {
    first_ok: outcome.first.ok,
    first: { ok: outcome.first.ok, violations: [], costPpMinor: outcome.first.costPpMinor },
    loops: outcome.loops,
    dropped: outcome.dropped,
    left: outcome.final.violations.map((v) => v.code),
    passes: outcome.passes,
    filled: outcome.filled,
    notes_removed: outcome.notesRemoved,
    retitled: outcome.retitled,
    essentials_left_out: outcome.essentialsLeftOut,
  };
}
