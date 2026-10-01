/**
 * What every drafting step shares: the trip and the pipeline input rebuilt from the database (so a
 * resumed step on another worker plans from the same facts), the job's model, the live step rows
 * on the drafting screen, and giving the trip back to setup when the draft finally fails.
 */
import {
  withWishAnswers,
  type DraftModel,
  type DraftPlanInput,
  type SkeletonPlan,
  type UsageContext,
} from '@cp/ai';
import { emitEvent, withSystem } from '@cp/db';
import type { DraftStepId, DraftStepLabel } from '@cp/domain';
import type pg from 'pg';

import type { AgentStepContext } from '../../../ai/job-runner';
import { destinationPhrases, resolveWishes } from '@cp/planner';

import { loadDraftTrip, type DraftTripData } from './load';
import { loadDraftPlaces, loadWishCandidates } from './load-places';
import { buildPlanInput } from './plan-input';
import type { PrefetchResult } from './prefetch';
import { skeletonRoute } from './skeleton';
import { publishDone, publishStep } from './steps';

export type DraftModelFactory = (usage: UsageContext) => DraftModel;

export interface Loaded {
  readonly trip: DraftTripData;
  readonly input: DraftPlanInput;
}

export async function load(
  ctx: AgentStepContext,
  closures: PrefetchResult['closures'] = [],
): Promise<Loaded> {
  const { tripId, userId } = ctx.agentJob;
  if (tripId === null || userId === null) throw new Error('draft job without a trip or organiser');
  const trip = await loadDraftTrip(ctx.pool, tripId, userId);
  if (trip === null) throw new Error('trip_not_ready');
  // Hand-typed must-dos are matched to places first, so the place a wish names is always on the
  // guide's list. The match is for this draft only; the must-do row keeps its text.
  const ignoreNames = destinationPhrases(trip.destination);
  const wishes = trip.mustDos.filter((m) => m.poiId === null);
  const wished = resolveWishes(
    wishes.map((m) => ({ id: m.id, text: m.title })),
    wishes.length === 0
      ? []
      : await loadWishCandidates(
          ctx.pool,
          trip.destinationId,
          wishes.map((m) => m.title),
          ignoreNames,
        ),
    ignoreNames,
  );
  const places = await loadDraftPlaces(ctx.pool, trip.destinationId, [
    ...trip.mustDos.flatMap((m) => (m.poiId === null ? [] : [m.poiId])),
    ...wished.places.values(),
    ...wished.offered,
  ]);
  const asked = buildPlanInput(trip, places, {
    jobId: ctx.agentJob.id,
    skeletonRoute: await skeletonRoute(ctx.pool),
    closures,
    wished,
    ignoreNames,
  });
  // Once the outline has run, every later step plans with the guide's answers to the wishes.
  const outline = (ctx.results.skeleton as { skeleton?: SkeletonPlan } | undefined)?.skeleton;
  const input = withWishAnswers(asked, outline?.wishAnswers ?? []);
  return { trip, input };
}

export function modelFor(
  factory: DraftModelFactory | undefined,
  ctx: AgentStepContext,
): DraftModel {
  if (factory === undefined) throw new Error('model_unavailable');
  return factory(ctx.usage);
}

export async function hint(
  ctx: AgentStepContext,
  step: DraftStepId,
  status: 'running' | 'done',
  label: DraftStepLabel | null = null,
): Promise<void> {
  if (ctx.agentJob.tripId === null) return;
  await publishStep(ctx.pool, ctx.agentJob.tripId, {
    job_id: ctx.agentJob.id,
    step,
    status,
    label,
    reason: null,
  });
}

/** Puts a trip whose draft finally failed back into setup, and tells the drafting screen. */
export async function giveBack(pool: pg.Pool, job: AgentStepContext['agentJob']): Promise<void> {
  if (job.tripId === null) return;
  const tripId = job.tripId;
  await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ crew_id: string }>(
      `UPDATE trips SET status = 'setup' WHERE id = $1 AND status = 'drafting' RETURNING crew_id`,
      [tripId],
    );
    await publishDone(tx, tripId, { job_id: job.id, status: 'failed', version_id: null });
    const crewId = rows[0]?.crew_id;
    if (crewId === undefined) return;
    await emitEvent(tx, {
      type: 'draft.failed',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'system',
      actorId: null,
      crewId,
      tripId,
      payload: { trip_id: tripId, job_id: job.id },
    });
  });
}

export function prefetched(ctx: AgentStepContext): PrefetchResult['closures'] {
  return (ctx.results.check_season as PrefetchResult | undefined)?.closures ?? [];
}
