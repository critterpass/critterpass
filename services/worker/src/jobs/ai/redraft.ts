/**
 * `ai.redraft` (docs/api-contracts-async.md §2.2): one day of an organiser's private draft, redone
 * for the reasons they chose. The guide sees the day, its neighbours, the reasons, the organiser's
 * note and the crew's recent chat (both as untrusted data), and keeps must-dos and bookings; the
 * planner times and checks the day, `redraftDiff` turns it into changes on stable ids, and the
 * metrics (time on trains, pace, must-dos kept, cost) come from code. The candidate is saved as a
 * private version for the organiser to keep or revert. A day that comes back unchanged, or a job
 * that finally fails, releases the reservation: only a delivered change counts.
 */
import { runRedraft, shownName, type RedraftOutcome } from '@cp/ai';
import { emitEvent, outbox, withSystem } from '@cp/db';
import {
  DRAFT_QUEUES,
  DRAFT_RT,
  REDRAFT_REASON_KEYS,
  type DraftDay,
  type RedraftResult,
} from '@cp/domain';
import { itineraryMetrics, redraftDiff, redraftMetrics } from '@cp/planner';
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
import { loadRoutedLegs, onTheRoad } from './draft/road-minutes';
import { draftChannel } from './draft/steps';
import { readerLocale, release } from './draft/redraft-release';

const redraftInputSchema = z.object({
  trip_id: z.uuid(),
  day: z.number().int().positive(),
  reasons: z.array(z.enum(REDRAFT_REASON_KEYS)),
  note: z.string().nullable(),
  base_version: z.uuid(),
});

/** What the redraft step keeps for the steps after it. */
type RedraftStep = Pick<RedraftOutcome, 'day' | 'title' | 'summary'> & {
  /** Other days an essential moved onto (absent on a job saved before they could). */
  readonly others?: readonly DraftDay[];
  /** Essentials the redraft took out of the trip, by place id. */
  readonly left_out?: readonly string[];
};

export interface RedraftJobDeps {
  readonly model?: DraftModelFactory | undefined;
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
    // The organiser reads the redraft's title, summary and reasons: they are written in her language.
    ...(await readerLocale(ctx.pool, ctx.agentJob.userId)),
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
          const { outcome, base } = await redraftStage(ctx, deps);
          // Another day changes only when an essential the day lost was moved onto it.
          const others = outcome.itinerary.days.filter((day) => {
            const was = base.days.find((d) => d.day_no === day.day_no);
            return day.day_no !== outcome.day.day_no && JSON.stringify(was) !== JSON.stringify(day);
          });
          return {
            day: outcome.day,
            title: outcome.title,
            summary: outcome.summary,
            others,
            left_out: outcome.leftOut,
          };
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
          const redrafted = ctx.results.redraft as RedraftStep;
          const baseDay = base.itinerary.days.find((d) => d.day_no === input.day);
          if (baseDay === undefined) throw new Error('no_base_day');
          const itinerary = {
            ...base.itinerary,
            days: base.itinerary.days.map((d) =>
              d.day_no === input.day
                ? redrafted.day
                : ((redrafted.others ?? []).find((o) => o.day_no === d.day_no) ?? d),
            ),
          };
          const changes = redraftDiff(baseDay, redrafted.day, redrafted.others ?? []);
          const legs = await withSystem(ctx.pool, (tx) => loadRoutedLegs(tx, trip.tripId));
          const metrics = redraftMetrics({
            base: onTheRoad(baseDay, legs, plan.pois),
            candidate: onTheRoad(redrafted.day, legs, plan.pois),
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
          const redrafted = ctx.results.redraft as RedraftStep;
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
                  (redrafted.left_out ?? []).flatMap((poiId) => {
                    const poi = plan.pois.get(poiId);
                    return poi === undefined ? [] : [{ poi_id: poiId, name: shownName(plan, poi) }];
                  }),
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
