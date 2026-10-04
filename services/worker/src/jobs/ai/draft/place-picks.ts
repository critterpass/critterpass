/**
 * A draft never starts from an empty shelf. A destination without a curated set is planned from
 * its machine picks (`src/places/pick/run.ts`); when a draft starts before those exist, they are
 * made first, inside the job, with a bounded wait on the naming call (the open-data fill needs no
 * model). And when the places we know still cannot fill the days, the draft says so: its summary
 * line tells the organiser, and the job logs it.
 */
import { writeDraftSummary, type DraftModel, type DraftPlanInput } from '@cp/ai';
import { pickCoverage, withSystem } from '@cp/db';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { JobLogger } from '../../../boss/define-job';
import { runPlacePick, type PlacePickDeps, type PlacePickReport } from '../../../places/pick/run';
import { queuePlacePick } from '../../places/pick';
import { allMustDosMade, type DraftToSave } from './persist';

/** How long a draft waits for the model to name the destination's well-known places. */
export const PICK_WAIT_MS = 45_000;

/** Candidates a day needs before a draft counts as more than a must-do list. */
export const MIN_CANDIDATES_PER_DAY = 2;

/**
 * Makes the destination's picks when it has neither a curated set nor picks; null when not needed.
 * When the naming call fails or runs out of time the draft goes on with the open-data fill, and
 * one forced `places.pick` is queued so the well-known places are asked for again (the job
 * retries, and only its last attempt goes without names).
 */
export async function ensurePlacePicks(
  pool: pg.Pool,
  deps: PlacePickDeps | undefined,
  destinationId: string,
  logger: JobLogger,
  boss: Pick<PgBoss, 'send'>,
): Promise<PlacePickReport | null> {
  const coverage = await withSystem(pool, (tx) => pickCoverage(tx, destinationId));
  if (!coverage.needsPicks) return null;
  try {
    const report = await runPlacePick(
      pool,
      deps ?? {},
      { destinationId, signal: AbortSignal.timeout(PICK_WAIT_MS) },
      logger,
    );
    if (report.names === 'failed' && report.destination !== null) {
      const slug = report.destination;
      await queuePlacePick(boss, slug, true).catch((error: unknown) =>
        logger.warn({ err: error, slug }, 'draft: forced place pick not queued'),
      );
    }
    return report;
  } catch (error) {
    logger.warn({ err: error, destinationId }, 'draft: place picks failed, drafting without');
    return null;
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
    ...(thin ? { thin: true } : {}),
  });
}
