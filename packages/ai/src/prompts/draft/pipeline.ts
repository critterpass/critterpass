/**
 * The drafting workflow as the job runs it and the eval grades it: outline (skeleton) → every day
 * in parallel → validate and repair the broken days → drop what still breaks a rule. The job runs
 * each stage as its own resumable step; `runDraftPlan` runs them back to back for the eval and the
 * bench.
 */
import type { DraftDay, Itinerary } from '@cp/domain';

import type { DraftModel, DraftPlanInput } from './context';
import { draftOneDay } from './day';
import { validateAndRepair, type RepairOutcome } from './repair';
import { runSkeleton, type SkeletonDay, type SkeletonPlan } from './skeleton';
import { withWishAnswers } from './wish-answers';

export interface DraftedDays {
  readonly itinerary: Itinerary;
  readonly unknownIds: number;
  readonly proseRejected: number;
}

/** Drafts every day at once; `onDay` hears each as it lands (the job streams it as a day card). */
export async function draftDays(
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: SkeletonPlan,
  onDay?: (day: DraftDay) => Promise<void>,
): Promise<DraftedDays> {
  const planned = (day: SkeletonDay) =>
    new Set(skeleton.days.filter((d) => d.dayNo !== day.dayNo).flatMap((d) => d.poiIds));
  const results = await Promise.all(
    skeleton.days.map(async (day) => {
      const drafted = await draftOneDay(
        model,
        input,
        { day, usedElsewhere: planned(day) },
        `day-${day.dayNo}`,
      );
      await onDay?.(drafted.day);
      return drafted;
    }),
  );
  return {
    itinerary: { currency: input.frame.currency, days: results.map((r) => r.day) },
    unknownIds: results.reduce((sum, r) => sum + r.unknownIds, 0),
    proseRejected: results.reduce((sum, r) => sum + r.proseRejected, 0),
  };
}

export interface DraftPlanResult extends RepairOutcome {
  readonly skeleton: SkeletonPlan;
  /** The input with the guide's wish answers applied: what the days were planned and checked on. */
  readonly input: DraftPlanInput;
  /** Invented ids across every reply (all dropped before anything is saved). */
  readonly unknownIdsTotal: number;
  readonly proseRejectedTotal: number;
}

export async function runDraftPlan(
  model: DraftModel,
  asked: DraftPlanInput,
): Promise<DraftPlanResult> {
  const skeleton = await runSkeleton(model, asked);
  const input = withWishAnswers(asked, skeleton.wishAnswers);
  const drafted = await draftDays(model, input, skeleton);
  const repaired = await validateAndRepair(model, input, skeleton, drafted.itinerary);
  return {
    ...repaired,
    skeleton,
    input,
    unknownIdsTotal: skeleton.unknownIds + drafted.unknownIds + repaired.unknownIds,
    proseRejectedTotal: skeleton.proseRejected + drafted.proseRejected + repaired.proseRejected,
  };
}
