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
): Promise<Outline> {
  if (groups.length < 2) return runSkeleton(model, input);
  const outlines = await Promise.all(
    groups.map((group, index) => outlineGroup(model, group, groupPrefix(groups, index))),
  );
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
  const skeleton = await outline(model, input, groups);
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
