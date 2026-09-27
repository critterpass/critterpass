/**
 * `job.progress` (docs/api-contracts-async.md §2.1 "Progress"): one hint per finished step of a
 * long job, on the owner's `user:#<uid>` channel or a feature channel such as `trip_draft:<id>`
 * ("Pon is drafting"). The `data` schema itself lives with the other user-channel payloads.
 */
import type { z } from 'zod';

import { rtJobProgressSchema } from './user';

export const JOB_PROGRESS_TYPE = 'job.progress';

export type JobProgressData = z.infer<typeof rtJobProgressSchema>;

/** Progress after `done` of `total` steps, as a whole percentage (last step always 100). */
export function jobProgressPct(done: number, total: number): number {
  if (total <= 0 || done >= total) return 100;
  return Math.max(0, Math.floor((done / total) * 100));
}

/** The validated `data` of a `job.progress` hint for `step`, the `done`-th of `total`. */
export function jobProgressData(input: {
  readonly jobId: string;
  readonly step: string;
  readonly done: number;
  readonly total: number;
}): JobProgressData {
  return rtJobProgressSchema.parse({
    job_id: input.jobId,
    step: input.step,
    pct: jobProgressPct(input.done, input.total),
  });
}
