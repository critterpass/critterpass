/**
 * `plan.changeset_expiry` (docs/api-contracts-async.md §2.3): the timer armed at a change set's
 * vote deadline. A vote still undecided then keeps the current plan: the poll closes as "no" and
 * the change set ends rejected, announced as expired. A vote closed some other way is settled by
 * its result; a replayed timer or an already settled set changes nothing.
 */
import {
  appendDomainEvent,
  loadPollState,
  outbox,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { channelName, DEFAULT_QUEUE_SPEC, PLAN_QUEUES, PLAN_RT, planQueueSpecs } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { closeVoteAsKept } from './stale-sweep';

export type ExpiryOutcome = 'expired' | 'settled' | 'not_due' | 'missing' | 'approved' | 'rejected';

export async function expireChangeSet(
  pool: pg.Pool,
  changeSetId: string,
  now: Date = new Date(),
): Promise<ExpiryOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      crew_id: string;
      status: string;
      poll_id: string | null;
    }>(
      `SELECT cs.trip_id, t.crew_id, cs.status, cs.poll_id
         FROM change_sets cs JOIN trips t ON t.id = cs.trip_id
        WHERE cs.id = $1 FOR UPDATE OF cs`,
      [changeSetId],
    );
    const row = rows[0];
    if (row === undefined) return 'missing';
    if (row.status !== 'voting' || row.poll_id === null) return 'settled';
    const state = await loadPollState(tx, row.poll_id, 'update');
    if (state === undefined) return 'missing';
    const channel = channelName('trip_plan', row.trip_id);
    if (state.poll.status === 'closed') {
      const approve = [...state.options].sort((a, b) => a.position - b.position)[0]?.id;
      const won = state.poll.winner_option_id !== null && state.poll.winner_option_id === approve;
      await tx.query(
        won
          ? "UPDATE change_sets SET status = 'approved', approved_by_kind = 'vote' WHERE id = $1"
          : "UPDATE change_sets SET status = 'rejected' WHERE id = $1",
        [changeSetId],
      );
      await outbox(tx, channel, won ? PLAN_RT.changesetTally : PLAN_RT.changesetRejected, {
        change_set_id: changeSetId,
      });
      return won ? 'approved' : 'rejected';
    }
    if (state.poll.closes_at !== null && state.poll.closes_at > now) return 'not_due';
    await closeVoteAsKept(tx, row.poll_id, 'deadline', now);
    await tx.query("UPDATE change_sets SET status = 'rejected' WHERE id = $1", [changeSetId]);
    await appendDomainEvent(tx, {
      type: 'change_set.expired',
      aggregateKind: 'change_set',
      aggregateId: changeSetId,
      actorKind: 'system',
      actorId: null,
      payload: { trip_id: row.trip_id, change_set_id: changeSetId },
      crewId: row.crew_id,
      tripId: row.trip_id,
    });
    await outbox(tx, channel, PLAN_RT.changesetExpired, { change_set_id: changeSetId });
    return 'expired';
  });
}

export function changesetExpiryJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: PLAN_QUEUES.changesetExpiry,
    spec: planQueueSpecs(DEFAULT_QUEUE_SPEC)[PLAN_QUEUES.changesetExpiry],
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await expireChangeSet(ctx.pool, data.ref_id) }),
  });
}
