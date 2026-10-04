/**
 * `start_idea_placement` (docs/api-contracts-planning.md): PLACE THEM FOR ME. Starts Tokek placing
 * the chosen ideas (or every idea not on a day) in the background. One placement runs per person
 * per trip: a second tap while it runs answers with the running job. Placing counts toward the
 * trip's silent daily cap on system jobs; it is never a redraft.
 */
import { startAgentJob } from '@cp/ai';
import { sendInTx } from '@cp/db';
import {
  DomainError,
  PLANNING_QUEUES,
  startIdeaPlacementPayloadSchema,
  type StartIdeaPlacementResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';

/** The placing job's steps, in the order the placing screen ticks them (the worker's own list). */
export const PLACE_IDEAS_STEPS = ['hours', 'locks', 'routing', 'needs_you'] as const;
const SYSTEM_JOBS_PER_TRIP_DAY = 40;

async function systemJobsCap(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM ops.ops_config WHERE key = 'fair_use.system_jobs_per_trip_day'",
  );
  const value = Number(rows[0]?.value);
  return Number.isInteger(value) && value > 0 ? value : SYSTEM_JOBS_PER_TRIP_DAY;
}

/** Past the trip's cap for the UTC day the start is refused as busy until the next day. */
async function requireUnderCap(tx: pg.PoolClient, tripId: string, now: Date): Promise<void> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM agent_jobs
      WHERE trip_id = $1 AND kind = 'place_ideas' AND created_at >= $2`,
    [tripId, day],
  );
  if ((rows[0]?.n ?? 0) < (await systemJobsCap(tx))) return;
  throw new DomainError('RATE_LIMITED', {
    retry_after_s: Math.ceil((day.getTime() + 86_400_000 - now.getTime()) / 1000),
  });
}

async function chosenIdeas(
  tx: pg.PoolClient,
  tripId: string,
  ideaIds: readonly string[] | undefined,
): Promise<string[] | null> {
  if (ideaIds === undefined) return null;
  const wanted = [...new Set(ideaIds)].sort();
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [tripId, wanted],
  );
  if (rows.length !== wanted.length) throw new DomainError('NOT_FOUND', { reason: 'idea' });
  return wanted;
}

export const startIdeaPlacementCommand = defineCommand({
  name: 'start_idea_placement',
  v: 1,
  schema: startIdeaPlacementPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx): Promise<StartIdeaPlacementResult> =>
    asSystemRole(tx, async () => {
      const { rows: trips } = await tx.query<{ version_id: string | null }>(
        'SELECT current_version_id AS version_id FROM trips WHERE id = $1',
        [payload.trip_id],
      );
      const versionId = trips[0]?.version_id ?? null;
      if (versionId === null) throw new DomainError('STATE_INVALID', { reason: 'no_current_plan' });
      const { rows: running } = await tx.query<{ id: string }>(
        `SELECT id FROM agent_jobs
          WHERE trip_id = $1 AND user_id = $2 AND kind = 'place_ideas'
            AND status IN ('queued', 'running')
          ORDER BY created_at DESC LIMIT 1`,
        [payload.trip_id, ctx.uid],
      );
      if (running[0] !== undefined) return { job_id: running[0].id };
      await requireUnderCap(tx, payload.trip_id, new Date());
      const ideaIds = await chosenIdeas(tx, payload.trip_id, payload.idea_ids);
      const job = await startAgentJob(
        tx,
        (queue, data, options) => sendInTx(tx, queue, data, options),
        {
          kind: 'place_ideas',
          queue: PLANNING_QUEUES.placeIdeas,
          userId: ctx.uid,
          tripId: payload.trip_id,
          input: { trip_id: payload.trip_id, idea_ids: ideaIds, version_id: versionId },
          stepIds: PLACE_IDEAS_STEPS,
          baseVersionId: versionId,
        },
      );
      return { job_id: job.id };
    }),
});
