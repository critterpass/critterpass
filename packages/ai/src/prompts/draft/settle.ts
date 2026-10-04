/**
 * What the planner does with a draft the guide could not put right, without another model call.
 * A day that still breaks a rule gives up its other stops before a must-do; whatever still breaks
 * an item-level rule is dropped (again after a drop moved a stop next to one it is too far from),
 * and a must-do that went that way is planned on another day that can take it; then the meals and,
 * for a first draft, the thin days are filled from the places near them. A day
 * still without a lunch or dinner after that has no place the planner could fit: that is how the
 * day is, not a rule the draft breaks, so it is not reported as one.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { dropViolations, type DropResult, type ValidationResult } from '@cp/planner';

import { fillMeals } from './complete-days';
import { fillThinDays } from './fill-days';
import type { DraftPlanInput } from './context';
import { scheduleChoices } from './day';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

const MAX_DROP_ROUNDS = 3;

/** Rules day `dayNo` breaks that a stop leaving could fix (a missing meal is filled, not trimmed). */
function dayViolations(result: ValidationResult, dayNo: number): number {
  return result.violations.filter((v) => v.dayNo === dayNo && v.code !== 'MEAL_MISSING').length;
}

/** The day without `gone`, re-timed by the planner. */
function without(
  input: DraftPlanInput,
  outline: SkeletonDay,
  itinerary: Itinerary,
  gone: ReadonlySet<string>,
  key: string,
): Itinerary {
  const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
  if (day === undefined) return itinerary;
  const kept = day.items.filter((item) => !gone.has(item.stable_id));
  const next = scheduleChoices(
    input,
    {
      ...outline,
      mustDoIds: kept.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
    },
    kept.map((item) => ({
      poiId: item.poi_id ?? '',
      kind: item.kind,
      mustDoId: item.must_do_id,
      note: item.note,
    })),
    key,
  );
  return {
    ...itinerary,
    days: itinerary.days.map((d) =>
      d.day_no === outline.dayNo ? { ...next, theme: day.theme } : d,
    ),
  };
}

/**
 * When the repairs are spent, a day that still breaks a rule gives up its other stops before a
 * must-do: stops without a must-do go one at a time (whichever removal fixes the most), and the
 * planner re-times the rest, until the day is clean or only must-dos are left (a meal before an
 * activity when either would do: the day is about its sights). A removal that
 * fixes nothing yet is still made when the must-dos alone would make a clean day (two stops may
 * have to go before a late must-do fits).
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
    const whole = itinerary.days.find((d) => d.day_no === dayNo);
    if (outline === undefined || whole === undefined) continue;
    const others = new Set(
      whole.items.filter((item) => item.must_do_id === null).map((item) => item.stable_id),
    );
    const bare = without(input, outline, itinerary, others, `trim-${dayNo}-bare`);
    const solvable = dayViolations(validate(input, bare), dayNo) === 0;
    let left = dayViolations(validate(input, itinerary), dayNo);
    for (let round = 0; left > 0; round += 1) {
      const day = itinerary.days.find((d) => d.day_no === dayNo);
      if (day === undefined) break;
      let best: { itinerary: Itinerary; left: number } | null = null;
      // Of the removals that fix as much, a meal goes first (another, nearer one is filled in
      // afterwards), then a stop the outline never planned, then the later of two.
      const planned = new Set(outline.poiIds);
      const rank = (item: DraftDay['items'][number]) =>
        item.kind === 'meal' ? 0 : planned.has(item.poi_id ?? '') ? 2 : 1;
      const candidates = day.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.must_do_id === null)
        .sort((a, b) => rank(a.item) - rank(b.item) || b.index - a.index)
        .map(({ item }) => item);
      for (const drop of candidates) {
        const candidate = without(
          input,
          outline,
          itinerary,
          new Set([drop.stable_id]),
          `trim-${dayNo}-${round}`,
        );
        const count = dayViolations(validate(input, candidate), dayNo);
        if (best === null || count < best.left) best = { itinerary: candidate, left: count };
      }
      if (best === null || best.left > left || (best.left === left && !solvable)) break;
      itinerary = best.itinerary;
      left = best.left;
    }
  }
  return itinerary;
}

/**
 * Plans each dropped must-do on another day its place is open, the lightest first, when that day
 * stays as clean as it was. Returns the must-dos that found a day.
 */
function rehome(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
  mustDoIds: readonly string[],
): { readonly itinerary: Itinerary; readonly placed: ReadonlySet<string> } {
  let itinerary = start;
  const placed = new Set<string>();
  for (const mustDoId of mustDoIds) {
    const slot = input.pools.mustDos.find((s) => s.mustDoId === mustDoId);
    if (slot === undefined) continue;
    const days = itinerary.days
      .filter((day) => slot.openDays.includes(day.day_no))
      .sort((a, b) => a.items.length - b.items.length || a.day_no - b.day_no);
    for (const day of days) {
      const outline = outlines.find((d) => d.dayNo === day.day_no);
      if (outline === undefined) continue;
      const choices = [
        ...day.items.map((item) => ({
          poiId: item.poi_id ?? '',
          kind: item.kind,
          mustDoId: item.must_do_id,
          note: item.note,
        })),
        { poiId: slot.poiId, kind: 'activity' as const, mustDoId, note: null },
      ];
      const next = scheduleChoices(
        input,
        {
          ...outline,
          mustDoIds: choices.flatMap((c) => (c.mustDoId === null ? [] : [c.mustDoId])),
        },
        choices,
        `rehome-${day.day_no}-${mustDoId}`,
      );
      if (next.items.length !== choices.length) continue;
      const candidate = {
        ...itinerary,
        days: itinerary.days.map((d) =>
          d.day_no === day.day_no ? { ...next, theme: day.theme } : d,
        ),
      };
      const before = dayViolations(validate(input, itinerary), day.day_no);
      if (dayViolations(validate(input, candidate), day.day_no) > before) continue;
      itinerary = candidate;
      placed.add(mustDoId);
      break;
    }
  }
  return { itinerary, placed };
}

export interface Settled {
  readonly itinerary: Itinerary;
  /** What still breaks a rule (a meal no place could serve is not one). */
  readonly final: ValidationResult;
  readonly dropped: DropResult['dropped'];
  /** Stops the planner added. */
  readonly filled: number;
}

const withoutUnservedMeals = (result: ValidationResult): ValidationResult => {
  const violations = result.violations.filter((v) => v.code !== 'MEAL_MISSING');
  return { ...result, violations, ok: violations.length === 0 };
};

/**
 * Settles `start` (see the file note). `dayNo` keeps the work to one day (a redraft answers only
 * for its own); `fillThin` also tops up days left with too few stops or a hole.
 */
export function settle(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
  checked: ValidationResult,
  options: { readonly dayNo?: number; readonly fillThin: boolean },
): Settled {
  const own = (result: ValidationResult): ValidationResult => {
    const violations =
      options.dayNo === undefined
        ? result.violations
        : result.violations.filter((v) => v.dayNo === options.dayNo);
    return { ...result, violations, ok: violations.length === 0 };
  };
  let itinerary = start;
  let current = own(checked);
  if (!current.ok) {
    itinerary = trimForMustDos(input, outlines, itinerary, current);
    current = own(validate(input, itinerary));
  }
  const dropped: DropResult['dropped'][number][] = [];
  for (let round = 0; round < MAX_DROP_ROUNDS && !current.ok; round += 1) {
    const cut = dropViolations(itinerary, current.violations);
    if (cut.dropped.length === 0) break;
    itinerary = cut.itinerary;
    dropped.push(...cut.dropped);
    current = own(validate(input, itinerary));
  }
  let lost = dropped;
  if (options.dayNo === undefined) {
    const moved = rehome(
      input,
      outlines,
      itinerary,
      dropped.flatMap((drop) => (drop.mustDoId === null ? [] : [drop.mustDoId])),
    );
    itinerary = moved.itinerary;
    lost = dropped.filter((drop) => drop.mustDoId === null || !moved.placed.has(drop.mustDoId));
  }
  let filled = 0;
  for (const fill of options.fillThin ? [fillMeals, fillThinDays] : [fillMeals]) {
    const done = fill(input, outlines, itinerary);
    itinerary = done.itinerary;
    filled += done.added;
  }
  return {
    itinerary,
    final: withoutUnservedMeals(validate(input, itinerary)),
    dropped: lost,
    filled,
  };
}
