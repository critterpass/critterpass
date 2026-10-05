/**
 * Validate, then repair only the days that broke a rule (at most two passes, the broken days in
 * parallel), then drop whatever still breaks one: the drafting job's last model stage. The planner
 * decides what is broken and on which day; the guide only redoes those days. What the planner can
 * finish itself needs no model call (./complete-days.ts): a missing lunch or dinner is added and
 * a stop that breaks a rule gives way before the first check, and what the repairs leave broken or thin is settled at the end
 * (./settle.ts). Last, a
 * line that names a time its stop is not at is taken off, and the first and last stop say what
 * was assumed about arriving and leaving.
 */
import type { Itinerary } from '@cp/domain';
import { repairTargets, type ValidationResult } from '@cp/planner';

import { fillMeals } from './complete-days';
import type { DraftModel, DraftPlanInput } from './context';
import { draftOneDay } from './day';
import { withFinalNotes } from './final-notes';
import { settle, trimForMustDos, withoutUnservedMeals } from './settle';
import type { SkeletonPlan } from './skeleton';
import { validate } from './validate';

export { withFinalNotes } from './final-notes';
export { trimForMustDos } from './settle';
export { requiredMustDoIds, validate } from './validate';

export const MAX_REPAIR_LOOPS = 2;

export interface RepairOutcome {
  readonly itinerary: Itinerary;
  readonly first: ValidationResult;
  readonly final: ValidationResult;
  readonly loops: number;
  readonly dropped: readonly { readonly stableId: string; readonly mustDoId: string | null }[];
  readonly unknownIds: number;
  readonly proseRejected: number;
  /** What each check found (pass 0 is the first), kept with the job to explain a draft later. */
  readonly passes: readonly RepairPass[];
  /** Stops the planner added itself: missing meals, and activities on days left thin. */
  readonly filled: number;
  /** Lines taken off because they named a meal or time of day their stop is not at. */
  readonly notesRemoved: number;
  /** Days whose title no longer matched their stops and was written again from them. */
  readonly retitled: number;
}

export interface RepairPass {
  readonly pass: number;
  readonly violations: readonly {
    readonly code: string;
    readonly dayNo: number | null;
    readonly poiId: string | null;
  }[];
}

function passOf(pass: number, result: ValidationResult): RepairPass {
  return {
    pass,
    violations: result.violations.map((v) => ({
      code: v.code,
      dayNo: v.dayNo,
      poiId: v.poiId ?? null,
    })),
  };
}

export async function validateAndRepair(
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: SkeletonPlan,
  drafted: Itinerary,
  onRepaired?: (dayNo: number) => Promise<void>,
): Promise<RepairOutcome> {
  // A day the guide left without its lunch or dinner gets one before anything is checked.
  const fed = fillMeals(input, skeleton.days, drafted);
  let itinerary = fed.itinerary;
  let filled = fed.added;
  // What a stop leaving puts right needs no model call either: on a day that breaks a rule, stops
  // without a must-do give way first, and the meal that went with them is filled again.
  const rough = validate(input, itinerary);
  if (!rough.ok) {
    const trimmed = trimForMustDos(input, skeleton.days, itinerary, rough);
    if (trimmed !== itinerary) {
      const refed = fillMeals(input, skeleton.days, trimmed);
      itinerary = refed.itinerary;
      filled += refed.added;
    }
  }
  // A meal the planner could not place itself is not asked of the guide either: the day says so.
  const first = withoutUnservedMeals(validate(input, itinerary));
  const passes = [passOf(0, first)];
  let current = first;
  let loops = 0;
  let unknownIds = 0;
  let proseRejected = 0;
  while (!current.ok && loops < MAX_REPAIR_LOOPS) {
    loops += 1;
    const targets = repairTargets({
      itinerary,
      violations: current.violations,
      pois: input.pois,
      mustDoDays: new Map(input.pools.mustDos.map((slot) => [slot.mustDoId, slot.openDays])),
      mustDoPoi: new Map(input.pools.mustDos.map((slot) => [slot.mustDoId, slot.poiId])),
      crewSize: input.frame.members.length,
    });
    if (targets.length === 0) break;
    const loop = loops;
    const redone = await Promise.all(
      targets.map(async (target) => {
        const day = skeleton.days.find((d) => d.dayNo === target.dayNo);
        if (day === undefined) return undefined;
        const usedElsewhere = new Set(
          itinerary.days
            .filter((d) => d.day_no !== target.dayNo)
            .flatMap((d) => d.items.map((item) => item.poi_id ?? '')),
        );
        const mustDoIds = [
          ...new Set([
            ...day.mustDoIds,
            ...target.reasons.flatMap((reason) =>
              reason.mustDoId === null ? [] : [reason.mustDoId],
            ),
          ]),
        ];
        const result = await draftOneDay(
          model,
          input,
          { day: { ...day, mustDoIds }, usedElsewhere },
          `repair-${loop}-${target.dayNo}`,
          {
            reasons: target.reasons,
            previous: itinerary.days.find((d) => d.day_no === target.dayNo) ?? {
              day_no: target.dayNo,
              date: day.date,
              theme: day.theme,
              items: [],
            },
          },
        );
        await onRepaired?.(target.dayNo);
        return result;
      }),
    );
    for (const result of redone) {
      if (result === undefined) continue;
      unknownIds += result.unknownIds;
      proseRejected += result.proseRejected;
      itinerary = {
        ...itinerary,
        days: itinerary.days.map((d) => (d.day_no === result.day.day_no ? result.day : d)),
      };
    }
    current = validate(input, itinerary);
    passes.push(passOf(loops, current));
  }
  // What the guide could not put right, the planner settles: stops give way, then gaps are filled.
  const settled = settle(input, skeleton.days, itinerary, current, { fillThin: true });
  itinerary = settled.itinerary;
  current = settled.final;
  filled += settled.filled;
  const { dropped } = settled;
  if (loops > 0 || dropped.length > 0) passes.push(passOf(loops + 1, current));
  const noted = withFinalNotes(input, itinerary);
  return {
    itinerary: noted.itinerary,
    first,
    final: current,
    loops,
    dropped,
    unknownIds,
    proseRejected,
    passes,
    filled,
    notesRemoved: noted.removed,
    retitled: noted.retitled,
  };
}
