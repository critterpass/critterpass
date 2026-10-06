/**
 * The day stage: every day of the outline drafted at once on the pro tier, each day card streamed
 * (theme and stop count) the moment it is planned and timed.
 */
import {
  draftDays,
  draftGroupDays,
  groupPrefix,
  joinDrafted,
  type DayGroup,
  type DraftedDays,
  type DraftModel,
  type DraftPlanInput,
} from '@cp/ai';
import type { DraftDay } from '@cp/domain';
import type pg from 'pg';

import type { Outline } from './skeleton';
import { publishDayTitle } from './steps';

/** The trip's days; planned in day groups, it also keeps each group's own (`groups`). */
export type Drafted = DraftedDays & { readonly groups?: readonly DraftedDays[] };

export async function daysStage(
  pool: pg.Pool,
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: Outline,
  trip: { readonly tripId: string },
  jobId: string,
  groups: readonly DayGroup[] = [],
): Promise<Drafted> {
  const onDay = (day: DraftDay) =>
    publishDayTitle(pool, trip.tripId, {
      job_id: jobId,
      day_no: day.day_no,
      theme: day.theme,
      stops: day.items.length,
    }).then(() => undefined);
  const outlines = skeleton.groups;
  if (groups.length < 2 || outlines === undefined) {
    return draftDays(model, input, skeleton, onDay);
  }
  const drafted = await Promise.all(
    groups.map((group, index) => {
      const own = outlines[index];
      if (own === undefined) throw new Error('draft: a day group has no outline');
      return draftGroupDays(model, group, groupPrefix(groups, index), own, onDay);
    }),
  );
  return { ...joinDrafted(groups, drafted), groups: drafted };
}
