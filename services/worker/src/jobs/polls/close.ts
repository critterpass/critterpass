/**
 * `poll.close` (docs/api-contracts-async.md §2.3): the `scheduled_events` timer armed at a poll's
 * `closes_at`. Under the poll row lock it closes the poll with the tie rule (a ballot racing the
 * deadline is either counted before this or refused after); a replayed timer, a poll closed by its
 * last ballot or a deadline moved later changes nothing.
 */
import {
  closePollInTx,
  loadPollState,
  POLL_CLOSE_QUEUE,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export type DeadlineOutcome = 'closed' | 'already_closed' | 'not_due' | 'on_board' | 'missing';

export async function closePollAtDeadline(
  pool: pg.Pool,
  pollId: string,
  now: Date = new Date(),
): Promise<DeadlineOutcome> {
  return withSystem(pool, async (tx) => {
    const state = await loadPollState(tx, pollId, 'update');
    if (state === undefined) return 'missing';
    if (state.poll.status !== 'open') return 'already_closed';
    if (state.poll.stage === 'board') return 'on_board';
    if (state.poll.closes_at === null || state.poll.closes_at > now) return 'not_due';
    await closePollInTx(tx, state, { reason: 'deadline', now, actorId: null });
    return 'closed';
  });
}

export function pollCloseJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: POLL_CLOSE_QUEUE,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await closePollAtDeadline(ctx.pool, data.ref_id) }),
  });
}
