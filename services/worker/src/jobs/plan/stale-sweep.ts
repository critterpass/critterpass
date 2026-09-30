/**
 * `plan.stale_sweep` (docs/api-contracts-async.md §2.2): after a new group version, every pending
 * change set drafted against an older one is rebased onto the current version when nothing it
 * touches moved in between, and marked stale (its vote closed, the plan kept) otherwise. Stale sets
 * show "Plan changed — refresh" and can never apply.
 */
import { appendDomainEvent, closePollInTx, loadPollState, outbox, withSystem } from '@cp/db';
import {
  applyPlanEdits,
  changeSetOpsSchema,
  changeSetOpsToEdits,
  channelName,
  PLAN_QUEUES,
  PLAN_RT,
  planQueueSpecs,
  DEFAULT_QUEUE_SPEC,
  type PlanState,
} from '@cp/domain';
import { changedSince, conflictsWith } from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { loadPlanState } from './plan-state';

const staleSweepJobSchema = z.object({ trip_id: z.uuid(), version_id: z.uuid().optional() });
type StaleSweepJob = z.infer<typeof staleSweepJobSchema>;

export interface SweepOutcome {
  readonly rebased: number;
  readonly stale: number;
}

function rebases(ops: unknown, base: PlanState, latest: PlanState): boolean {
  const edits = changeSetOpsToEdits(changeSetOpsSchema.parse(ops));
  if (conflictsWith(edits, changedSince(base, latest)).length > 0) return false;
  try {
    applyPlanEdits(latest, edits);
    return true;
  } catch {
    return false;
  }
}

/** Closes a stale set's open vote as "no": the plan stays as it is. */
export async function closeVoteAsKept(
  tx: pg.PoolClient,
  pollId: string | null,
  reason: 'manual' | 'deadline',
  now: Date,
): Promise<void> {
  if (pollId === null) return;
  const state = await loadPollState(tx, pollId, 'update');
  if (state === undefined || state.poll.status !== 'open') return;
  const reject = [...state.options].sort((a, b) => a.position - b.position)[1]?.id ?? null;
  await closePollInTx(tx, state, { reason, now, actorId: null, deciderWinner: reject });
}

export async function sweepStaleChangeSets(
  pool: pg.Pool,
  tripId: string,
  now: Date = new Date(),
): Promise<SweepOutcome> {
  return withSystem(pool, async (tx) => {
    const trip = await tx.query<{ current: string | null; crew_id: string }>(
      'SELECT current_version_id AS current, crew_id FROM trips WHERE id = $1 FOR UPDATE',
      [tripId],
    );
    const current = trip.rows[0]?.current ?? null;
    const crewId = trip.rows[0]?.crew_id;
    if (current === null || crewId === undefined) return { rebased: 0, stale: 0 };
    const pending = await tx.query<{
      id: string;
      base_version_id: string;
      ops: unknown;
      poll_id: string | null;
    }>(
      `SELECT id, base_version_id, ops, poll_id FROM change_sets
        WHERE trip_id = $1 AND scope = 'group' AND base_version_id <> $2
          AND status IN ('draft', 'proposed', 'voting', 'approved')
        ORDER BY id FOR UPDATE`,
      [tripId, current],
    );
    if (pending.rows.length === 0) return { rebased: 0, stale: 0 };
    const latest = await loadPlanState(tx, current);
    const bases = new Map<string, PlanState>();
    const channel = channelName('trip_plan', tripId);
    let rebased = 0;
    let stale = 0;
    for (const row of pending.rows) {
      const base = bases.get(row.base_version_id) ?? (await loadPlanState(tx, row.base_version_id));
      bases.set(row.base_version_id, base);
      if (rebases(row.ops, base, latest)) {
        await tx.query('UPDATE change_sets SET base_version_id = $2 WHERE id = $1', [
          row.id,
          current,
        ]);
        await outbox(tx, channel, PLAN_RT.changesetRebased, {
          change_set_id: row.id,
          base_version: current,
        });
        rebased += 1;
        continue;
      }
      await tx.query("UPDATE change_sets SET status = 'stale' WHERE id = $1", [row.id]);
      await closeVoteAsKept(tx, row.poll_id, 'manual', now);
      await appendDomainEvent(tx, {
        type: 'change_set.stale',
        aggregateKind: 'change_set',
        aggregateId: row.id,
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: tripId, change_set_id: row.id },
        crewId,
        tripId,
      });
      await outbox(tx, channel, PLAN_RT.changesetStale, { change_set_id: row.id });
      stale += 1;
    }
    return { rebased, stale };
  });
}

export function staleSweepJob(): JobDefinition<StaleSweepJob> {
  return defineJob({
    queue: PLAN_QUEUES.staleSweep,
    spec: planQueueSpecs(DEFAULT_QUEUE_SPEC)[PLAN_QUEUES.staleSweep],
    schema: staleSweepJobSchema,
    singletonKey: (data) => `${data.trip_id}:${data.version_id ?? ''}`,
    handler: async (data, ctx) => ({ ...(await sweepStaleChangeSets(ctx.pool, data.trip_id)) }),
  });
}
