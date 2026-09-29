/**
 * `poll.remind`: the 24 h and 2 h timers before a poll closes. Appends `poll.closing_soon` while
 * someone still has not voted; the N-02 push goes to those voters only (./result-fanout.ts).
 */
import {
  appendDomainEvent,
  loadPollState,
  POLL_REMIND_QUEUE,
  scheduledJobDataSchema,
  tallyOf,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export async function remindPendingVoters(
  pool: pg.Pool,
  pollId: string,
  slot: string,
  now: Date = new Date(),
): Promise<'reminded' | 'nobody_pending' | 'skipped'> {
  if (slot !== '24h' && slot !== '2h') return 'skipped';
  return withSystem(pool, async (tx) => {
    const state = await loadPollState(tx, pollId);
    const poll = state?.poll;
    if (
      state === undefined ||
      poll === undefined ||
      poll.status !== 'open' ||
      poll.stage === 'board'
    ) {
      return 'skipped';
    }
    if (poll.closes_at === null || poll.closes_at <= now) return 'skipped';
    if (tallyOf(state).pendingVoterIds.length === 0) return 'nobody_pending';
    await appendDomainEvent(tx, {
      type: 'poll.closing_soon',
      aggregateKind: 'poll',
      aggregateId: pollId,
      actorKind: 'system',
      actorId: null,
      payload: { poll_id: pollId, slot },
      crewId: poll.crew_id,
      ...(poll.trip_id === null ? {} : { tripId: poll.trip_id }),
    });
    return 'reminded';
  });
}

export function pollRemindJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: POLL_REMIND_QUEUE,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => `${data.ref_id}:${data.slot}`,
    handler: async (data, ctx) => ({
      outcome: await remindPendingVoters(ctx.pool, data.ref_id, data.slot),
    }),
  });
}
