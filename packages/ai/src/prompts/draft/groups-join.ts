/**
 * Joining what each day group planned into one trip (./groups.ts): every day number a group used
 * (its own 1…n) goes back to the trip's, and the counts are added up, so coverage and numbers are
 * worked out once over the whole trip.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import type { DraftPoi, MustDoSlot, ValidationResult } from '@cp/planner';

import type { DraftPlanInput } from './context';
import type { DraftedDays } from './pipeline';
import type { RepairOutcome, RepairPass } from './repair';
import type { SkeletonPlan } from './skeleton';

/** The trip day numbers of one group, in order: its own day `n` is `dayNos[n - 1]`. */
export interface Numbered {
  readonly dayNos: readonly number[];
}

export function tripDayOf(group: Numbered, dayNo: number): number {
  return group.dayNos[dayNo - 1] ?? dayNo;
}

const tripDayOrNull = (group: Numbered, dayNo: number | null): number | null =>
  dayNo === null ? null : tripDayOf(group, dayNo);

const byDay =
  <T>(dayOf: (item: T) => number) =>
  (a: T, b: T) =>
    dayOf(a) - dayOf(b);

function joinDays(groups: readonly Numbered[], days: readonly (readonly DraftDay[])[]): DraftDay[] {
  return groups
    .flatMap((group, index) =>
      (days[index] ?? []).map((day) => ({ ...day, day_no: tripDayOf(group, day.day_no) })),
    )
    .sort(byDay((day) => day.day_no));
}

export function joinItineraries(
  groups: readonly Numbered[],
  itineraries: readonly Itinerary[],
): Itinerary {
  return {
    currency: itineraries[0]?.currency ?? '',
    days: joinDays(
      groups,
      itineraries.map((itinerary) => itinerary.days),
    ),
  };
}

const sum = <T>(items: readonly T[], of: (item: T) => number) =>
  items.reduce((total, item) => total + of(item), 0);

export function joinOutlines(
  groups: readonly Numbered[],
  outlines: readonly SkeletonPlan[],
): SkeletonPlan {
  const adjusted = outlines.flatMap((outline) => (outline.adjusted ? [outline.adjusted] : []));
  return {
    stayArea: outlines[0]?.stayArea ?? '',
    days: groups
      .flatMap((group, index) =>
        (outlines[index]?.days ?? []).map((day) => ({
          ...day,
          dayNo: tripDayOf(group, day.dayNo),
        })),
      )
      .sort(byDay((day) => day.dayNo)),
    unknownIds: sum(outlines, (outline) => outline.unknownIds),
    proseRejected: sum(outlines, (outline) => outline.proseRejected),
    wishAnswers: groups.flatMap((group, index) =>
      (outlines[index]?.wishAnswers ?? []).map((answer) => ({
        ...answer,
        dayNo: tripDayOrNull(group, answer.dayNo),
      })),
    ),
    ...(adjusted.length === 0
      ? {}
      : {
          adjusted: {
            removed: sum(adjusted, (a) => a.removed),
            added: sum(adjusted, (a) => a.added),
          },
        }),
  };
}

export function joinDrafted(
  groups: readonly Numbered[],
  drafted: readonly DraftedDays[],
): DraftedDays {
  return {
    itinerary: joinItineraries(
      groups,
      drafted.map((d) => d.itinerary),
    ),
    unknownIds: sum(drafted, (d) => d.unknownIds),
    proseRejected: sum(drafted, (d) => d.proseRejected),
  };
}

function joinValidations(
  groups: readonly Numbered[],
  results: readonly ValidationResult[],
): ValidationResult {
  return {
    ok: results.every((result) => result.ok),
    violations: groups.flatMap((group, index) =>
      (results[index]?.violations ?? []).map((v) => ({
        ...v,
        dayNo: tripDayOrNull(group, v.dayNo),
      })),
    ),
    costPpMinor: sum(results, (result) => result.costPpMinor),
  };
}

function joinPasses(
  groups: readonly Numbered[],
  passes: readonly (readonly RepairPass[])[],
): RepairPass[] {
  const count = Math.max(0, ...passes.map((list) => list.length));
  return Array.from({ length: count }, (_, pass) => ({
    pass,
    violations: groups.flatMap((group, index) =>
      (passes[index]?.[pass]?.violations ?? []).map((v) => ({
        ...v,
        dayNo: tripDayOrNull(group, v.dayNo),
      })),
    ),
  }));
}

export function joinRepairs(
  groups: readonly Numbered[],
  outcomes: readonly RepairOutcome[],
): RepairOutcome {
  return {
    itinerary: joinItineraries(
      groups,
      outcomes.map((o) => o.itinerary),
    ),
    first: joinValidations(
      groups,
      outcomes.map((o) => o.first),
    ),
    final: joinValidations(
      groups,
      outcomes.map((o) => o.final),
    ),
    loops: Math.max(0, ...outcomes.map((o) => o.loops)),
    dropped: outcomes.flatMap((o) => o.dropped),
    unknownIds: sum(outcomes, (o) => o.unknownIds),
    proseRejected: sum(outcomes, (o) => o.proseRejected),
    passes: joinPasses(
      groups,
      outcomes.map((o) => o.passes),
    ),
    filled: sum(outcomes, (o) => o.filled),
    notesRemoved: sum(outcomes, (o) => o.notesRemoved),
    retitled: sum(outcomes, (o) => o.retitled),
    essentialsLeftOut: outcomes.flatMap((o) => o.essentialsLeftOut),
  };
}

/**
 * One view over every group's input, for saving and grading: all places, all must-dos, all wish
 * answers, held stops and open days under trip day numbers. The first group's settings (guide,
 * names, travel, ids) stand for the trip's.
 */
export function joinInputs(
  groups: readonly Numbered[],
  inputs: readonly DraftPlanInput[],
): DraftPlanInput {
  const first = inputs[0];
  if (first === undefined) throw new Error('draft: no day group to join');
  const each = <T>(of: (input: DraftPlanInput, group: Numbered) => readonly T[]): T[] =>
    groups.flatMap((group, index) => {
      const input = inputs[index];
      return input === undefined ? [] : of(input, group);
    });
  const days = (group: Numbered, list: readonly number[]) =>
    list.map((dayNo) => tripDayOf(group, dayNo));
  const openDays = new Map<string, number[]>();
  for (const [poiId, list] of each((input, group) =>
    [...input.pools.openDays].map(([id, open]) => [id, days(group, open)] as const),
  )) {
    openDays.set(
      poiId,
      [...(openDays.get(poiId) ?? []), ...list].sort((a, b) => a - b),
    );
  }
  const dated = each((input, group) => input.frame.dates.map((date, i) => ({ date, i, group })));
  const last = inputs[inputs.length - 1] ?? first;
  // The trip lands on its first day and leaves on its last, as a frame says by default.
  const { arrivalDay: _arrival, leavingDay: _leaving, reach: _reach, ...frame } = first.frame;
  return {
    ...first,
    frame: {
      ...frame,
      dates: dated.sort(byDay(({ group, i }) => tripDayOf(group, i + 1))).map(({ date }) => date),
      departureMin: last.frame.departureMin,
      laterStartDays: each((input, group) => days(group, input.frame.laterStartDays ?? [])),
      mustDos: each((input) => input.frame.mustDos),
      closures: each((input) => input.frame.closures),
    },
    pois: new Map<string, DraftPoi>(each((input) => [...input.pois])),
    pools: {
      ...first.pools,
      mustDos: each((input, group): MustDoSlot[] =>
        input.pools.mustDos.map((slot) => ({ ...slot, openDays: days(group, slot.openDays) })),
      ),
      unplaceable: each((input) => input.pools.unplaceable),
      activities: each((input) => input.pools.activities),
      sights: each((input) => input.pools.sights),
      meals: each((input) => input.pools.meals),
      eateries: each((input) => input.pools.eateries),
      outings: each((input) => input.pools.outings),
      openDays,
    },
    wishes: each((input) => input.wishes),
    wishAnswers: each((input, group) =>
      (input.wishAnswers ?? []).map((a) => ({ ...a, dayNo: tripDayOrNull(group, a.dayNo) })),
    ),
    untimed: each((input) => input.untimed ?? []),
    held: each((input, group) =>
      (input.held ?? []).map((stop) => ({ ...stop, dayNo: tripDayOf(group, stop.dayNo) })),
    ),
  };
}
