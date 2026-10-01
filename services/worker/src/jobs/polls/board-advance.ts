/**
 * `poll.board_advance`: the destination board's deadline (7 days after it opened, unless the
 * organiser moved it on sooner). Two or more places → the top two go to the final; a tie for a
 * final spot → the organiser is asked to pick (and the board gets another day); one place → it
 * wins outright; an empty board waits another board window.
 */
import {
  advanceBoardInTx,
  appendDomainEvent,
  armPollTimers,
  closePollInTx,
  decideOnBallots,
  loadPollState,
  POLL_BOARD_ADVANCE_QUEUE,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { BOARD_WINDOW_MS } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

/** How long the board waits for the organiser's pick before the timer looks again. */
export const PICK_WAIT_MS = 24 * 60 * 60 * 1000;

export type BoardDeadlineOutcome =
  'advanced' | 'needs_pick' | 'single_winner' | 'extended' | 'not_due' | 'not_on_board' | 'missing';

async function extend(tx: pg.PoolClient, pollId: string, by: number, now: Date): Promise<void> {
  const closesAt = new Date(now.getTime() + by);
  await tx.query('UPDATE polls SET closes_at = $2 WHERE id = $1', [pollId, closesAt]);
  await armPollTimers(tx, pollId, 'board', closesAt, now);
}

export async function advanceBoardAtDeadline(
  pool: pg.Pool,
  pollId: string,
  now: Date = new Date(),
): Promise<BoardDeadlineOutcome> {
  return withSystem(pool, async (tx) => {
    const state = await loadPollState(tx, pollId, 'update');
    if (state === undefined) return 'missing';
    const { poll } = state;
    if (poll.status !== 'open' || poll.stage !== 'board') return 'not_on_board';
    if (poll.closes_at !== null && poll.closes_at > now) return 'not_due';
    const live = state.options.filter((option) => option.eliminated_at === null);
    if (live.length === 0) {
      await extend(tx, pollId, BOARD_WINDOW_MS, now);
      return 'extended';
    }
    if (live.length === 1) {
      await closePollInTx(tx, state, { reason: 'deadline', now, actorId: null });
      return 'single_winner';
    }
    const outcome = await advanceBoardInTx(tx, state, { now, actorId: null });
    if (outcome.outcome === 'advanced') {
      // Ballots on the two finalists carry into the final; when they already decide it, close now.
      const final = await loadPollState(tx, pollId, 'update');
      const verdict =
        final === undefined ? { decided: false as const } : await decideOnBallots(tx, final);
      if (final !== undefined && verdict.decided) {
        await closePollInTx(tx, final, {
          reason: verdict.reason,
          now,
          actorId: null,
          deciderWinner: verdict.winnerOptionId,
        });
      }
      return 'advanced';
    }
    if (outcome.outcome === 'needs_pick') {
      await extend(tx, pollId, PICK_WAIT_MS, now);
      await appendDomainEvent(tx, {
        type: 'poll.pick_needed',
        aggregateKind: 'poll',
        aggregateId: pollId,
        actorKind: 'system',
        actorId: null,
        payload: { poll_id: pollId, tied_option_ids: [...outcome.tiedOptionIds] },
        crewId: poll.crew_id,
        ...(poll.trip_id === null ? {} : { tripId: poll.trip_id }),
      });
      return 'needs_pick';
    }
    return 'not_on_board';
  });
}

export function pollBoardAdvanceJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: POLL_BOARD_ADVANCE_QUEUE,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => data.ref_id,
    handler: async (data, ctx) => ({
      outcome: await advanceBoardAtDeadline(ctx.pool, data.ref_id),
    }),
  });
}
