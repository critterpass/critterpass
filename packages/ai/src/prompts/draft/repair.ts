/**
 * Validate, then repair only the days that broke a rule (at most two passes, the broken days in
 * parallel), then drop whatever still breaks one: the drafting job's last model stage. The planner
 * decides what is broken and on which day; the guide only redoes those days. What the planner can
 * finish itself needs no model call (./complete-days.ts): a missing lunch or dinner is added
 * before the first check, and days left thin after the repairs are filled at the end. Last, a
 * line that names a time its stop is not at is taken off, and the first and last stop say what
 * was assumed about arriving and leaving.
 */
import type { Itinerary } from '@cp/domain';
import {
  dropViolations,
  repairTargets,
  withAssumedTravelNotes,
  withHonestNotes,
  type ValidationResult,
} from '@cp/planner';

import { fillMeals, fillThinDays } from './complete-days';
import type { DraftModel, DraftPlanInput } from './context';
import { draftOneDay, scheduleChoices } from './day';
import type { SkeletonDay, SkeletonPlan } from './skeleton';
import { validate } from './validate';

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

/**
 * The finishing touches every stage shares: notes that name a time their stop is not at come off,
 * and the stops at the trip's edges say what was assumed about arriving and leaving.
 */
export function withFinalNotes(
  input: DraftPlanInput,
  itinerary: Itinerary,
): { readonly itinerary: Itinerary; readonly removed: number } {
  const honest = withHonestNotes(itinerary, input.pois, input.frame.tz);
  return {
    itinerary: withAssumedTravelNotes(honest.itinerary, input.frame),
    removed: honest.removed,
  };
}

function dayViolations(result: ValidationResult, dayNo: number): number {
  return result.violations.filter((v) => v.dayNo === dayNo).length;
}

/**
 * When the repairs are spent, a day that still breaks a rule gives up its other stops before a
 * must-do: stops without a must-do go one at a time (whichever removal fixes the most), and the
 * planner re-times the rest, until the day is clean or only must-dos are left.
 */
export function trimForMustDos(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
  result: ValidationResult,
): Itinerary {
  let itinerary = start;
  const broken = [
    ...new Set(result.violations.flatMap((v) => (v.dayNo === null ? [] : [v.dayNo]))),
  ];
  for (const dayNo of broken) {
    const outline = outlines.find((d) => d.dayNo === dayNo);
    if (outline === undefined) continue;
    let left = dayViolations(validate(input, itinerary), dayNo);
    for (let round = 0; left > 0; round += 1) {
      const day = itinerary.days.find((d) => d.day_no === dayNo);
      if (day === undefined) break;
      let best: { itinerary: Itinerary; left: number } | null = null;
      for (const drop of day.items.filter((item) => item.must_do_id === null)) {
        const choices = day.items
          .filter((item) => item.stable_id !== drop.stable_id)
          .map((item) => ({
            poiId: item.poi_id ?? '',
            kind: item.kind,
            mustDoId: item.must_do_id,
            note: item.note,
          }));
        const mustDoIds = day.items.flatMap((item) =>
          item.must_do_id === null ? [] : [item.must_do_id],
        );
        const next = scheduleChoices(
          input,
          { ...outline, mustDoIds },
          choices,
          `trim-${dayNo}-${round}`,
        );
        const candidate = {
          ...itinerary,
          days: itinerary.days.map((d) => (d.day_no === dayNo ? { ...next, theme: day.theme } : d)),
        };
        const count = dayViolations(validate(input, candidate), dayNo);
        if (best === null || count < best.left) best = { itinerary: candidate, left: count };
      }
      if (best === null || best.left >= left) break;
      itinerary = best.itinerary;
      left = best.left;
    }
  }
  return itinerary;
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
  const first = validate(input, itinerary);
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
  if (!current.ok) {
    itinerary = trimForMustDos(input, skeleton.days, itinerary, current);
    current = validate(input, itinerary);
  }
  let dropped: RepairOutcome['dropped'] = [];
  if (!current.ok) {
    const cut = dropViolations(itinerary, current.violations);
    itinerary = cut.itinerary;
    dropped = cut.dropped;
    current = validate(input, itinerary);
  }
  // What repairs, trims and drops left short is filled from the day's own lists.
  for (const fill of [fillMeals, fillThinDays]) {
    const done = fill(input, skeleton.days, itinerary);
    itinerary = done.itinerary;
    filled += done.added;
  }
  if (filled > fed.added) current = validate(input, itinerary);
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
  };
}
