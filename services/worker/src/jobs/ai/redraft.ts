/**
 * `ai.redraft` (docs/api-contracts-async.md §2.2): one day of an organiser's private draft, redone
 * for the reasons they chose. The guide sees the day, its neighbours, the reasons, the organiser's
 * note and the crew's recent chat (both as untrusted data), and keeps must-dos and bookings; the
 * planner times and checks the day, `redraftDiff` turns it into changes on stable ids, and the
 * metrics (time on trains, pace, must-dos kept, cost) come from code. The candidate is saved as a
 * private version for the organiser to keep or revert. A day that comes back unchanged, or a job
 * that finally fails, releases the reservation: only a delivered change counts.
 */
import { runRedraft, type RedraftOutcome } from '@cp/ai';
import { emitEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  DRAFT_QUEUES,
  DRAFT_RT,
  REDRAFT_COUNTER_RT,
  REDRAFT_REASON_KEYS,
  type RedraftResult,
} from '@cp/domain';
import { itineraryMetrics, redraftDiff, redraftMetrics } from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import {
  defineAgentJob,
  type AgentJobDefinition,
  type AgentStepContext,
} from '../../ai/job-runner';
import { load, modelFor, type DraftModelFactory } from './draft/job-context';
import { holdDay } from './draft/held-stops';
import { staysPpMinor } from './draft/plan-input';
import { candidateCoverage, loadBaseDraft, saveCandidate } from './draft/redraft-store';
import { draftChannel } from './draft/steps';

const redraftInputSchema = z.object({
  trip_id: z.uuid(),
  day: z.number().int().positive(),
  reasons: z.array(z.enum(REDRAFT_REASON_KEYS)),
  note: z.string().nullable(),
  base_version: z.uuid(),
});

export interface RedraftJobDeps {
  readonly model?: DraftModelFactory | undefined;
}

/** Releases the job's reservation (and its quota unit) and gives the trip back to review. */
async function release(tx: pg.PoolClient, jobId: string, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ quota_period_key: string | null }>(
    `UPDATE redraft_reservations SET status = 'released', settled_at = now()
      WHERE agent_job_id = $1 AND status = 'reserved' RETURNING quota_period_key`,
    [jobId],
  );
  const key = rows[0]?.quota_period_key ?? null;
  if (key !== null) {
    await tx.query("SELECT app.release_quota('trip', $1, 'redrafts', $2)", [tripId, key]);
  }
  await tx.query(
    "UPDATE trips SET status = 'draft_review' WHERE id = $1 AND status = 'redrafting'",
    [tripId],
  );
  const counter = await tx.query<{ used: number }>(
    `SELECT coalesce((SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1
                        AND metric = 'redrafts' AND period_key = 'lifetime'), 0)::int AS used`,
    [tripId],
  );
  const limits = await tx.query<{ redraft_limit: number }>(
    'SELECT redraft_limit FROM trip_entitlements WHERE trip_id = $1',
    [tripId],
  );
  const limit = limits.rows[0]?.redraft_limit ?? 3;
  await outbox(tx, channelName('trip', tripId), REDRAFT_COUNTER_RT, {
    used: counter.rows[0]?.used ?? 0,
    limit: limit >= 2_147_483_647 ? null : limit,
  });
}

function inputOf(ctx: AgentStepContext) {
  return redraftInputSchema.parse(ctx.input);
}

async function redraftStage(ctx: AgentStepContext, deps: RedraftJobDeps) {
  const input = inputOf(ctx);
  const { trip, input: plan, held } = await load(ctx);
  const base = await loadBaseDraft(
    ctx.pool,
    ctx.agentJob.userId ?? '',
    trip.tripId,
    trip.crewId,
    input.base_version,
    plan.travel,
    new Set(held.map((stop) => stop.item.stable_id)),
  );
  if (base === null) throw new Error('base_version_gone');
  const redone = await runRedraft(modelFor(deps.model, ctx), {
    ...plan,
    base: base.itinerary,
    dayNo: input.day,
    reasons: input.reasons,
    note: input.note,
    chat: base.chat,
  });
  // The stops she added by hand on the day stay exactly as she placed them, whatever came back.
  const outcome = { ...redone, day: holdDay(redone.day, held, plan.travel).day };
  return { trip, plan, base: base.itinerary, outcome };
}

export function redraftJob(deps: RedraftJobDeps): AgentJobDefinition {
  return defineAgentJob({
    kind: 'redraft',
    queue: DRAFT_QUEUES.redraft,
    progressChannel: (job) => (job.tripId === null ? undefined : draftChannel(job.tripId)),
    steps: [
      {
        id: 'reserve',
        run: async (ctx) => {
          const { rows } = await withSystem(ctx.pool, (tx) =>
            tx.query<{ status: string }>(
              'SELECT status FROM redraft_reservations WHERE agent_job_id = $1',
              [ctx.agentJob.id],
            ),
          );
          if (rows[0]?.status !== 'reserved') throw new Error('reservation_not_held');
          return { reserved: true };
        },
        compensate: async (_result, ctx) => {
          const tripId = ctx.agentJob.tripId;
          if (tripId === null) return;
          await withSystem(ctx.pool, async (tx) => {
            await release(tx, ctx.agentJob.id, tripId);
            await outbox(tx, draftChannel(tripId), DRAFT_RT.redraftResult, {
              redraft_id: ctx.agentJob.id,
              status: 'failed',
            });
          });
        },
      },
      {
        id: 'load',
        run: async (ctx) => {
          const input = inputOf(ctx);
          const { rows } = await withSystem(ctx.pool, (tx) =>
            tx.query<{ draft_version_id: string | null }>(
              'SELECT draft_version_id FROM trips WHERE id = $1',
              [input.trip_id],
            ),
          );
          if (rows[0]?.draft_version_id !== input.base_version)
            throw new Error('base_version_moved');
          return { day_no: input.day };
        },
      },
      {
        id: 'redraft',
        maxTries: 2,
        run: async (ctx) => {
          const { outcome } = await redraftStage(ctx, deps);
          return { day: outcome.day, title: outcome.title, summary: outcome.summary };
        },
      },
      {
        id: 'diff',
        run: async (ctx) => {
          const input = inputOf(ctx);
          const { trip, input: plan } = await load(ctx);
          const base = await loadBaseDraft(
            ctx.pool,
            ctx.agentJob.userId ?? '',
            trip.tripId,
            trip.crewId,
            input.base_version,
            plan.travel,
          );
          if (base === null) throw new Error('base_version_gone');
          const redrafted = ctx.results.redraft as Pick<
            RedraftOutcome,
            'day' | 'title' | 'summary'
          >;
          const baseDay = base.itinerary.days.find((d) => d.day_no === input.day);
          if (baseDay === undefined) throw new Error('no_base_day');
          const itinerary = {
            ...base.itinerary,
            days: base.itinerary.days.map((d) => (d.day_no === input.day ? redrafted.day : d)),
          };
          const changes = redraftDiff(baseDay, redrafted.day);
          const metrics = redraftMetrics({
            base: baseDay,
            candidate: redrafted.day,
            candidateItinerary: itinerary,
            requiredMustDoIds: plan.pools.mustDos.map((slot) => slot.mustDoId),
            crewSize: Math.max(1, trip.members.length),
            currency: trip.currency,
          });
          return { itinerary, changes, metrics };
        },
      },
      {
        id: 'persist',
        maxTries: 3,
        run: async (ctx) => {
          const input = inputOf(ctx);
          const tripId = input.trip_id;
          const { trip, input: plan } = await load(ctx);
          const diff = ctx.results.diff as Pick<RedraftResult, 'changes' | 'metrics'> & {
            itinerary: RedraftOutcome['itinerary'];
          };
          const redrafted = ctx.results.redraft as Pick<RedraftOutcome, 'title' | 'summary'>;
          return withSystem(ctx.pool, async (tx) => {
            const changed = diff.changes.length > 0;
            let candidate: string | null = null;
            if (changed) {
              const targetPp =
                trip.budget === null
                  ? null
                  : Math.max(0, trip.budget.targetMinor - trip.budget.flightsMinor);
              const metrics = itineraryMetrics({
                itinerary: diff.itinerary,
                crewSize: Math.max(1, trip.members.length),
                staysPpMinor: staysPpMinor(trip),
                targetPpMinor: targetPp,
                validation: { first_pass_clean: true, repair_loops: 0, dropped: 0 },
              });
              candidate = await saveCandidate(tx, {
                jobId: ctx.agentJob.id,
                tripId,
                baseVersionId: input.base_version,
                itinerary: diff.itinerary,
                metrics,
                coverage: await candidateCoverage(
                  tx,
                  input.base_version,
                  diff.itinerary,
                  plan.pois,
                ),
              });
            } else {
              await release(tx, ctx.agentJob.id, tripId);
            }
            const result: RedraftResult = {
              redraft_id: ctx.agentJob.id,
              day_no: input.day,
              base_version_id: input.base_version,
              candidate_version_id: candidate,
              outcome: changed ? 'changed' : 'identical',
              title: redrafted.title,
              summary: redrafted.summary,
              changes: diff.changes,
              metrics: changed ? diff.metrics : null,
            };
            await outbox(tx, draftChannel(tripId), DRAFT_RT.redraftResult, {
              redraft_id: ctx.agentJob.id,
              status: 'succeeded',
              outcome: result.outcome,
              candidate_version_id: candidate,
              day_no: input.day,
            });
            await emitEvent(tx, {
              type: 'redraft.delivered',
              aggregateKind: 'trip',
              aggregateId: tripId,
              actorKind: 'system',
              actorId: null,
              crewId: trip.crewId,
              tripId,
              payload: { trip_id: tripId, redraft_id: ctx.agentJob.id, outcome: result.outcome },
            });
            return result;
          });
        },
      },
    ],
    resultRef: (results) => results.persist,
  });
}
