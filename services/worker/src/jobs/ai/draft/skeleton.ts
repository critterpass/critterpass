/**
 * The outline stage: the skeleton call on the tier ops chose (`ai.draft.skeleton_model`, pro by
 * default, fast as the latency fallback), then every day's theme streams to the drafting screen as
 * the first day cards.
 */
import {
  groupPrefix,
  joinOutlines,
  outlineGroup,
  runSkeleton,
  type DayGroup,
  type DraftModel,
  type DraftPlanInput,
  type SkeletonPlan,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { eachGroup, groupProgress, type GroupProgress } from './group-progress';
import { publishDayTitle } from './steps';

export const SKELETON_TIER_KEY = 'ai.draft.skeleton_model';

/** The skeleton's route from the ops setting; anything but `fast` is the pro tier. */
export async function skeletonRoute(pool: pg.Pool): Promise<DraftPlanInput['skeletonRoute']> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [
      SKELETON_TIER_KEY,
    ]),
  );
  return rows[0]?.value === 'fast' ? 'draft.skeleton_fast' : 'draft.skeleton';
}

/** The trip's outline; planned in day groups, it also keeps each group's own (`groups`). */
export type Outline = SkeletonPlan & { readonly groups?: readonly SkeletonPlan[] };

async function outline(
  model: DraftModel,
  input: DraftPlanInput,
  groups: readonly DayGroup[],
  progress: GroupProgress | undefined,
): Promise<Outline> {
  if (groups.length < 2) return runSkeleton(model, input);
  const outlines = await eachGroup(groups.length, progress, (index) => {
    const group = groups[index];
    if (group === undefined) throw new Error('draft: no such day group');
    return outlineGroup(model, group, groupPrefix(groups, index));
  });
  return { ...joinOutlines(groups, outlines), groups: outlines };
}

export async function outlineStage(
  pool: pg.Pool,
  model: DraftModel,
  input: DraftPlanInput,
  trip: { readonly tripId: string },
  jobId: string,
  groups: readonly DayGroup[] = [],
): Promise<Outline> {
  const skeleton = await outline(model, input, groups, groupProgress(pool, jobId, 'skeleton'));
  await Promise.all(
    skeleton.days.map((day) =>
      publishDayTitle(pool, trip.tripId, {
        job_id: jobId,
        day_no: day.dayNo,
        theme: day.theme,
        stops: null,
      }),
    ),
  );
  return skeleton;
}
