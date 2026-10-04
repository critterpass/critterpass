/**
 * `ai.place_ideas` (docs/api-contracts-planning.md): Tokek places the chosen ideas on days in the
 * background, with no model call. Four steps the placing screen ticks through: read the places'
 * hours, note what is booked (nothing booked moves), route the touched days, and leave what needs
 * the person (split, needs a move, nowhere fits) while writing the placed stops as one private
 * draft change set (trigger `ideas`, author = the requester). Placing ideas is not a redraft.
 * Done, it appends `ideas.placed` for the quiet push; leaving the screen never cancels it.
 */
import { createHash } from 'node:crypto';

import { withSystem } from '@cp/db';
import {
  changeSetOpsSchema,
  PLANNING_QUEUES,
  planningQueueSpecs,
  DEFAULT_QUEUE_SPEC,
  type ChangeSetOp,
  type FitReason,
} from '@cp/domain';
import type { LeftReason } from '@cp/planner';
import { z } from 'zod';

import { defineAgentJob, type AgentJobDefinition } from '../../../ai/job-runner';
import {
  loadPlacement,
  placementIdeas,
  runPlacement,
  type LoadedPlacement,
} from './placement-load';

export const PLACE_IDEAS_STEP_IDS = ['hours', 'locks', 'routing', 'needs_you'] as const;

const inputSchema = z.object({
  trip_id: z.uuid(),
  idea_ids: z.array(z.uuid()).nullable(),
  version_id: z.uuid(),
});

/** A placed stop as the placing screen animates it and the review lists it. */
export interface PlacedStop {
  readonly idea_id: string;
  readonly target: string;
  readonly day_no: number;
  readonly number: number;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly reasons: readonly FitReason[];
}

export interface LeftForYou {
  readonly idea_id: string;
  readonly reason: LeftReason;
  readonly day_no: number | null;
  readonly needs_move: string | null;
}

export interface RoutingResult {
  readonly version_id: string;
  readonly tz: string;
  readonly days: readonly number[];
  readonly placed: readonly PlacedStop[];
  readonly left: readonly LeftForYou[];
}

/** The stop's stable id, the same on every retry of the job. */
export function placedStableId(jobId: string, ideaId: string): string {
  const hex = createHash('sha256').update(`place_ideas:${jobId}:${ideaId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function load(pool: Parameters<typeof withSystem>[0], input: unknown) {
  const parsed = inputSchema.parse(input);
  const placement = await withSystem(pool, (tx) => loadPlacement(tx, parsed, new Date()));
  if (placement === null) throw new Error('no_current_plan');
  return placement;
}

function route(
  jobId: string,
  placement: LoadedPlacement,
  ideas: Parameters<typeof runPlacement>[1],
) {
  const result = runPlacement(placement, ideas);
  const placed: PlacedStop[] = result.placed.map((stop) => ({
    idea_id: stop.ideaId,
    target: placedStableId(jobId, stop.ideaId),
    day_no: stop.dayNo,
    number: stop.number,
    starts_at: stop.startsAt.toISOString(),
    ends_at: stop.endsAt.toISOString(),
    reasons: stop.reasons.slice(0, 3),
  }));
  const left: LeftForYou[] = result.left.map((idea) => ({
    idea_id: idea.ideaId,
    reason: idea.reason,
    day_no: idea.dayNo,
    needs_move: idea.needsMove,
  }));
  const days = [...new Set(placed.map((stop) => stop.day_no))].sort((a, b) => a - b);
  return { version_id: placement.versionId, tz: placement.loaded.trip.tz, days, placed, left };
}

/** The placed stops as one private draft; a retry finds the draft it already wrote. */
async function writeDraft(
  tx: Parameters<Parameters<typeof withSystem>[1]>[0],
  job: { readonly id: string; readonly tripId: string; readonly userId: string },
  routing: RoutingResult,
): Promise<string | null> {
  if (routing.placed.length === 0) return null;
  const source = `place_ideas:${job.id}`;
  const { rows: existing } = await tx.query<{ id: string }>(
    `SELECT id FROM change_sets WHERE trip_id = $1 AND trigger = 'ideas' AND author_id = $2
        AND ops @> $3::jsonb`,
    [job.tripId, job.userId, JSON.stringify([{ source_ids: [source] }])],
  );
  if (existing[0] !== undefined) return existing[0].id;
  const { rows: ideas } = await tx.query<{
    id: string;
    poi_id: string | null;
    name: string;
    category: string;
    lat: number;
    lng: number;
  }>(
    `SELECT i.id, i.poi_id, i.name, coalesce(p.category, i.category) AS category, i.lat, i.lng
       FROM trip_ideas i LEFT JOIN pois p ON p.id = i.poi_id WHERE i.id = ANY($1::uuid[])`,
    [routing.placed.map((stop) => stop.idea_id)],
  );
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  const ops: ChangeSetOp[] = changeSetOpsSchema.parse(
    routing.placed.map((stop) => {
      const idea = byId.get(stop.idea_id);
      // A dropped pin has no place row: the stop carries the pin's own name and position.
      const custom =
        idea !== undefined && idea.poi_id === null
          ? { name: idea.name, lat: idea.lat, lng: idea.lng }
          : null;
      return {
        op: 'add',
        target: stop.target,
        after: {
          day_no: stop.day_no,
          starts_at: stop.starts_at,
          ends_at: stop.ends_at,
          tz: routing.tz,
          poi_id: idea?.poi_id ?? null,
          ...(custom === null ? {} : { custom_place: custom }),
          category: idea?.category ?? 'other',
          attendee_ids: [],
        },
        reason: 'ideas_placed',
        affected_user_ids: [],
        booking_impact: false,
        source_ids: [source, `idea:${stop.idea_id}`],
      };
    }),
  );
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id,
                              status, ops)
     VALUES ($1, $2, 'ideas', 'group', 'user', $3, 'draft', $4) RETURNING id`,
    [job.tripId, routing.version_id, job.userId, JSON.stringify(ops)],
  );
  return rows[0]?.id ?? null;
}

export function placeIdeasJob(): AgentJobDefinition {
  return defineAgentJob({
    kind: 'place_ideas',
    queue: PLANNING_QUEUES.placeIdeas,
    spec: planningQueueSpecs(DEFAULT_QUEUE_SPEC)[PLANNING_QUEUES.placeIdeas],
    steps: [
      {
        id: 'hours',
        async run(ctx) {
          const placement = await load(ctx.pool, ctx.input);
          const known = placement.ideas.filter((idea) => idea.hours !== null).length;
          return { ideas: placement.ideas.length, hours_known: known };
        },
      },
      {
        id: 'locks',
        async run(ctx) {
          const placement = await load(ctx.pool, ctx.input);
          const locked = placement.loaded.context.days.flatMap((day) =>
            day.items.filter((item) => item.locked),
          ).length;
          return { locked };
        },
      },
      {
        id: 'routing',
        async run(ctx): Promise<RoutingResult> {
          const placement = await load(ctx.pool, ctx.input);
          const ideas = await withSystem(ctx.pool, (tx) => placementIdeas(tx, placement.ideas));
          return route(ctx.agentJob.id, placement, ideas);
        },
      },
      {
        id: 'needs_you',
        async run(ctx) {
          const routing = ctx.results['routing'] as RoutingResult;
          const { tripId, userId } = ctx.agentJob;
          if (tripId === null || userId === null) throw new Error('place_ideas job without owner');
          const changeSetId = await withSystem(ctx.pool, (tx) =>
            writeDraft(tx, { id: ctx.agentJob.id, tripId, userId }, routing),
          );
          return { change_set_id: changeSetId, left: routing.left };
        },
      },
    ],
    resultRef: (results) => ({
      change_set_id: (results['needs_you'] as { change_set_id: string | null }).change_set_id,
    }),
    notifyOnComplete: (results, job) => {
      if (job.tripId === null || job.userId === null) return undefined;
      const done = results['needs_you'] as { change_set_id: string | null };
      return {
        type: 'ideas.placed',
        aggregateKind: 'trip',
        aggregateId: job.tripId,
        actorKind: 'system',
        actorId: null,
        tripId: job.tripId,
        payload: {
          trip_id: job.tripId,
          job_id: job.id,
          user_id: job.userId,
          change_set_id: done.change_set_id,
        },
      };
    },
  });
}
