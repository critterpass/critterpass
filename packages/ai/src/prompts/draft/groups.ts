/**
 * A trip planned in day groups: the days spent in one destination (a city's days, even around a day
 * trip, or the one day of a day trip) are planned together, from that destination's places, with
 * its own frame and guide, by the same stages as a trip with one destination. Inside a group days
 * are numbered 1…n; everything that leaves it carries the trip's day numbers (./groups-join.ts).
 *
 * The group that holds trip day 1 keeps today's call names and ids, so a trip of one group makes
 * exactly the calls it always made. Any other group's calls and ids carry its position (`g2:`).
 * A group of one day that is a day trip is outlined in code, under the destination's name; its
 * day is still written by the guide.
 */
import type { DraftDay } from '@cp/domain';

import type { DraftModel, DraftPlanInput } from './context';
import { joinDrafted, joinInputs, joinOutlines, joinRepairs, tripDayOf } from './groups-join';
import { draftDays, runDraftPlan, type DraftedDays, type DraftPlanResult } from './pipeline';
import { validateAndRepair, type RepairOutcome } from './repair';
import { normaliseSkeleton, runSkeleton, type SkeletonPlan } from './skeleton';
import { withWishAnswers } from './wish-answers';

export interface DayGroup {
  /** The destination the group's days are spent in. */
  readonly destinationId: string;
  /** Trip day numbers, ascending (a city's days around a day trip need not be consecutive). */
  readonly dayNos: readonly number[];
  /** The group's own input: its places, its guide, and a frame holding only its dates. */
  readonly input: DraftPlanInput;
  /** Set for the day of a day trip: the area's name, its theme. */
  readonly dayTrip?: { readonly name: string } | null;
}

/** What the calls and ids of group `index` are prefixed with ('' for the group of day 1). */
export function groupPrefix(groups: readonly Pick<DayGroup, 'dayNos'>[], index: number): string {
  return groups[index]?.dayNos.includes(1) === true ? '' : `g${index + 1}:`;
}

/** The model as group `prefix` calls it: each call's key carries the prefix. */
export function groupModel(model: DraftModel, prefix: string): DraftModel {
  if (prefix === '') return model;
  return { call: (route, input, key) => model.call(route, input, `${prefix}${key}`) };
}

/** The group's input as its stages plan with it: ids that cannot meet another group's. */
export function groupInput(group: DayGroup, prefix: string): DraftPlanInput {
  if (prefix === '') return group.input;
  const { idFor } = group.input;
  return { ...group.input, idFor: (key) => idFor(`${prefix}${key}`) };
}

/** A day trip's one day, outlined in code: its theme is the area, its stops the area's best. */
function dayTripOutline(input: DraftPlanInput, name: string): SkeletonPlan {
  return normaliseSkeleton(input, {
    stay_area: name,
    days: [
      {
        day_no: 1,
        theme: name,
        area: name,
        must_do_ids: input.pools.mustDos.map((slot) => slot.mustDoId),
        poi_ids: [],
      },
    ],
    wishes: [],
  });
}

/** The outline of one group: the model's, or a day trip's own. */
export function outlineGroup(
  model: DraftModel,
  group: DayGroup,
  prefix: string,
): Promise<SkeletonPlan> {
  const input = groupInput(group, prefix);
  if (group.dayTrip != null && group.dayNos.length === 1) {
    return Promise.resolve(dayTripOutline(input, group.dayTrip.name));
  }
  return runSkeleton(groupModel(model, prefix), input);
}

/** Every day of one group, each heard with its trip day number. */
export function draftGroupDays(
  model: DraftModel,
  group: DayGroup,
  prefix: string,
  outline: SkeletonPlan,
  onDay?: (day: DraftDay) => Promise<void>,
): Promise<DraftedDays> {
  const input = withWishAnswers(groupInput(group, prefix), outline.wishAnswers);
  return draftDays(
    groupModel(model, prefix),
    input,
    outline,
    onDay === undefined
      ? undefined
      : (day) => onDay({ ...day, day_no: tripDayOf(group, day.day_no) }),
  );
}

/** The check and repair of one group's days. */
export function repairGroup(
  model: DraftModel,
  group: DayGroup,
  prefix: string,
  outline: SkeletonPlan,
  drafted: DraftedDays,
): Promise<RepairOutcome> {
  const input = withWishAnswers(groupInput(group, prefix), outline.wishAnswers);
  return validateAndRepair(groupModel(model, prefix), input, outline, drafted.itinerary);
}

/** Every group's input with its wish answers applied, joined into one view of the trip. */
export function joinedInput(
  groups: readonly DayGroup[],
  outlines: readonly SkeletonPlan[],
): DraftPlanInput {
  return joinInputs(
    groups,
    groups.map((group, index) =>
      withWishAnswers(
        groupInput(group, groupPrefix(groups, index)),
        outlines[index]?.wishAnswers ?? [],
      ),
    ),
  );
}

export { joinDrafted, joinOutlines, joinRepairs, tripDayOf };

/**
 * The whole workflow over day groups, back to back (the eval and the bench). One group is exactly
 * `runDraftPlan`.
 */
export async function runGroupedDraftPlan(
  model: DraftModel,
  groups: readonly DayGroup[],
): Promise<DraftPlanResult> {
  const only = groups[0];
  if (groups.length === 1 && only !== undefined && only.dayTrip == null) {
    return runDraftPlan(model, only.input);
  }
  const planned = await Promise.all(
    groups.map(async (group, index) => {
      const prefix = groupPrefix(groups, index);
      const outline = await outlineGroup(model, group, prefix);
      const drafted = await draftGroupDays(model, group, prefix, outline);
      const repaired = await repairGroup(model, group, prefix, outline, drafted);
      return { outline, drafted, repaired };
    }),
  );
  const skeleton = joinOutlines(
    groups,
    planned.map((p) => p.outline),
  );
  const drafted = joinDrafted(
    groups,
    planned.map((p) => p.drafted),
  );
  const repaired = joinRepairs(
    groups,
    planned.map((p) => p.repaired),
  );
  return {
    ...repaired,
    skeleton,
    input: joinedInput(
      groups,
      planned.map((p) => p.outline),
    ),
    unknownIdsTotal: skeleton.unknownIds + drafted.unknownIds + repaired.unknownIds,
    proseRejectedTotal: skeleton.proseRejected + drafted.proseRejected + repaired.proseRejected,
  };
}
