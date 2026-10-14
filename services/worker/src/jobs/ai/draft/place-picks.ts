/**
 * A draft never starts from an empty shelf. A destination without a curated set is planned from
 * what its destination brief recommends (the brief writes the destination's recommended places,
 * docs/product-decisions.md D38); a draft that starts while that brief is still being written waits
 * for it, up to `BRIEF_WAIT_MS`, and then goes on with what is known. The brief itself is queued on
 * the pitch or trip that first names the destination; the draft queues nothing. And when the places
 * we know still cannot fill the days, the draft says so: its summary line tells the organiser, and
 * the job logs it.
 */
import { longVisitsOf, writeDraftSummary, type DraftModel, type DraftPlanInput } from '@cp/ai';
import { pickCoverage, withSystem } from '@cp/db';
import type pg from 'pg';

import type { JobLogger } from '../../../boss/define-job';
import { allMustDosMade, type DraftToSave } from './persist';

/** How long a draft waits for the destination's brief. */
export const BRIEF_WAIT_MS = 45_000;
const BRIEF_POLL_MS = 3_000;

/** Candidates a day needs before a draft counts as more than a must-do list. */
export const MIN_CANDIDATES_PER_DAY = 2;

/**
 * What the draft found: `not_needed` (a curated set, or recommended places already), the brief's
 * finished status, `none` (no brief asked for), or `timeout` (still being written).
 */
export type BriefWait = 'not_needed' | 'ready' | 'declined' | 'failed' | 'none' | 'timeout';

/** Waits for the destination's brief when the destination has nothing recommended yet. */
export async function awaitDestinationBrief(
  pool: pg.Pool,
  destinationId: string,
  logger: JobLogger,
  options: { readonly waitMs?: number; readonly pollMs?: number } = {},
): Promise<BriefWait> {
  const coverage = await withSystem(pool, (tx) => pickCoverage(tx, destinationId));
  if (!coverage.needsPicks) return 'not_needed';
  const deadline = Date.now() + (options.waitMs ?? BRIEF_WAIT_MS);
  for (;;) {
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ status: 'pending' | 'ready' | 'declined' | 'failed' }>(
        'SELECT status FROM destination_briefs WHERE destination_id = $1',
        [destinationId],
      ),
    );
    const status = rows[0]?.status;
    if (status === undefined) return 'none';
    if (status !== 'pending') return status;
    if (Date.now() >= deadline) {
      logger.warn({ destinationId }, 'draft: destination brief still pending, drafting without');
      return 'timeout';
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? BRIEF_POLL_MS));
  }
}

/** True when the pools hold fewer places than `MIN_CANDIDATES_PER_DAY` for each day. */
export function tooFewCandidates(input: Pick<DraftPlanInput, 'pools' | 'frame'>): boolean {
  const candidates = new Set([
    ...input.pools.mustDos.map((slot) => slot.poiId),
    ...input.pools.activities.map((poi) => poi.id),
    ...input.pools.meals.map((poi) => poi.id),
  ]);
  return candidates.size < MIN_CANDIDATES_PER_DAY * input.frame.dates.length;
}

/** The guide's line under the draft; it owns up to a thin plan, and the job logs one. */
export async function draftSummary(
  model: DraftModel,
  save: DraftToSave,
  themes: readonly string[],
  logger: JobLogger,
): Promise<string> {
  const { trip, input } = save;
  const thin = tooFewCandidates(input);
  if (thin) {
    logger.warn(
      {
        jobId: save.jobId,
        tripId: trip.tripId,
        destinationId: trip.destinationId,
        days: input.frame.dates.length,
        activities: input.pools.activities.length,
        meals: input.pools.meals.length,
      },
      'draft: too few places known for this destination',
    );
  }
  return writeDraftSummary(model, {
    guide: input.guide,
    destination: trip.destination.split(',')[0] ?? trip.destination,
    themes,
    allMustDos: allMustDosMade(save),
    names: [...input.pois.values()].map((p) => p.name),
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    ...(thin ? { thin: true } : {}),
    longVisits: longVisitsOf(input, save.outcome.itinerary),
  });
}
