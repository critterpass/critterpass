/**
 * The day stage: every day of the outline drafted at once on the pro tier, each day card streamed
 * (theme and stop count) the moment it is planned and timed.
 */
import {
  draftDays,
  type DraftedDays,
  type DraftModel,
  type DraftPlanInput,
  type SkeletonPlan,
} from '@cp/ai';
import type pg from 'pg';

import { publishDayTitle } from './steps';

export function daysStage(
  pool: pg.Pool,
  model: DraftModel,
  input: DraftPlanInput,
  skeleton: SkeletonPlan,
  trip: { readonly tripId: string },
  jobId: string,
): Promise<DraftedDays> {
  return draftDays(model, input, skeleton, (day) =>
    publishDayTitle(pool, trip.tripId, {
      job_id: jobId,
      day_no: day.day_no,
      theme: day.theme,
      stops: day.items.length,
    }).then(() => undefined),
  );
}
