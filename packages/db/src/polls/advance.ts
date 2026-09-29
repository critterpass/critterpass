/**
 * The destination board's stage moves and the poll timers. The board advances to a two-place
 * final (top two by votes; a tie for a final spot is the organiser's pick), knocking the other
 * places back into the deck and dropping their ballots so those voters are asked again; the
 * organiser may reopen the board. Timers: the board's advance, the close, and the reminders to
 * pending voters 24 h and 2 h before it. The caller holds the poll row lock as `app_system`.
 */
import {
  BOARD_WINDOW_MS,
  FINAL_WINDOW_MS,
  pickFinalists,
  POLL_REMINDERS,
  type PollStage,
} from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent } from '../events';
import { cancelScheduledEvent, scheduleEvent } from '../jobs';
import { POLL_BOARD_ADVANCE_QUEUE, POLL_CLOSE_QUEUE, POLL_REMIND_QUEUE, tiePreview } from './close';
import { loadPollState, optionOrder, publishPollHints, tallyOf, type PollState } from './state';

/** Arms the timers for the poll's current stage and `closes_at` (re-arming replaces old ones). */
export async function armPollTimers(
  tx: pg.PoolClient,
  pollId: string,
  stage: PollStage | null,
  closesAt: Date | null,
  now: Date,
): Promise<void> {
  const board = stage === 'board';
  await cancelScheduledEvent(tx, {
    kind: board ? POLL_CLOSE_QUEUE : POLL_BOARD_ADVANCE_QUEUE,
    refId: pollId,
  });
  if (closesAt === null) return;
  await scheduleEvent(tx, {
    kind: board ? POLL_BOARD_ADVANCE_QUEUE : POLL_CLOSE_QUEUE,
    refId: pollId,
    tz: 'UTC',
    at: closesAt,
  });
  for (const reminder of POLL_REMINDERS) {
    const at = new Date(closesAt.getTime() - reminder.beforeMs);
    if (board || at <= now) {
      await cancelScheduledEvent(tx, {
        kind: POLL_REMIND_QUEUE,
        refId: pollId,
        slot: reminder.slot,
      });
      continue;
    }
    await scheduleEvent(tx, {
      kind: POLL_REMIND_QUEUE,
      refId: pollId,
      slot: reminder.slot,
      tz: 'UTC',
      at,
      data: { slot: reminder.slot },
    });
  }
}

export interface StageMoveInput {
  readonly now: Date;
  readonly actorId: string | null;
}

export type AdvanceBoardResult =
  | { readonly outcome: 'advanced'; readonly finalists: readonly [string, string] }
  | {
      readonly outcome: 'needs_pick';
      readonly tiedOptionIds: readonly string[];
      readonly settled: readonly string[];
    }
  | { readonly outcome: 'too_few' }
  | { readonly outcome: 'not_on_board' };

async function stageChanged(
  tx: pg.PoolClient,
  state: PollState,
  from: PollStage,
  to: PollStage,
  input: StageMoveInput,
): Promise<void> {
  await appendDomainEvent(tx, {
    type: 'poll.stage_changed',
    aggregateKind: 'poll',
    aggregateId: state.poll.id,
    actorKind: input.actorId === null ? 'system' : 'user',
    actorId: input.actorId,
    payload: { poll_id: state.poll.id, from, to },
    crewId: state.poll.crew_id,
    ...(state.poll.trip_id === null ? {} : { tripId: state.poll.trip_id }),
  });
}

export async function advanceBoardInTx(
  tx: pg.PoolClient,
  state: PollState,
  input: StageMoveInput & { readonly pick?: readonly string[] },
): Promise<AdvanceBoardResult> {
  const { poll } = state;
  if (poll.kind !== 'destination' || poll.status !== 'open' || poll.stage !== 'board') {
    return { outcome: 'not_on_board' };
  }
  const picked = pickFinalists(tallyOf(state), optionOrder(state), input.pick);
  if (picked.outcome !== 'finalists') return picked;
  const finalists = new Set(picked.optionIds);
  const out = state.options.filter((o) => o.eliminated_at === null && !finalists.has(o.id));
  const outIds = out.map((o) => o.id);
  await tx.query('UPDATE poll_options SET eliminated_at = $2 WHERE id = ANY ($1::uuid[])', [
    outIds,
    input.now,
  ]);
  await tx.query('DELETE FROM ballots WHERE option_id = ANY ($1::uuid[])', [outIds]);
  for (const option of state.options) {
    if (option.pitch_id === null || option.eliminated_at !== null) continue;
    await tx.query('UPDATE pitches SET status = $2 WHERE id = $1', [
      option.pitch_id,
      finalists.has(option.id) ? 'final' : 'back_in_deck',
    ]);
  }
  const closesAt = new Date(input.now.getTime() + FINAL_WINDOW_MS);
  await tx.query(
    `UPDATE polls SET stage = 'final', stage_changed_at = $2, closes_at = $3,
            tie_rule = 'cheaper_for_majority_origin', version = version + 1
      WHERE id = $1`,
    [poll.id, input.now, closesAt],
  );
  const after = await loadPollState(tx, poll.id);
  if (after === undefined) throw new Error('poll vanished while advancing');
  const preview = await tiePreview(tx, after);
  await tx.query(
    `UPDATE polls SET result = coalesce(result, '{}'::jsonb) || jsonb_build_object('tie_preview', $2::jsonb)
      WHERE id = $1`,
    [poll.id, JSON.stringify(preview)],
  );
  await armPollTimers(tx, poll.id, 'final', closesAt, input.now);
  await stageChanged(tx, state, 'board', 'final', input);
  await publishPollHints(tx, after, tallyOf(after), 'poll.updated', { stage: 'final' });
  return { outcome: 'advanced', finalists: picked.optionIds };
}

export async function reopenBoardInTx(
  tx: pg.PoolClient,
  state: PollState,
  input: StageMoveInput,
): Promise<boolean> {
  const { poll } = state;
  if (poll.kind !== 'destination' || poll.status !== 'open' || poll.stage !== 'final') return false;
  await tx.query('UPDATE poll_options SET eliminated_at = NULL WHERE poll_id = $1', [poll.id]);
  for (const option of state.options) {
    if (option.pitch_id === null) continue;
    await tx.query("UPDATE pitches SET status = 'on_board' WHERE id = $1", [option.pitch_id]);
  }
  const closesAt = new Date(input.now.getTime() + BOARD_WINDOW_MS);
  await tx.query(
    `UPDATE polls SET stage = 'board', stage_changed_at = $2, closes_at = $3,
            tie_rule = 'organiser_pick', result = result - 'tie_preview', version = version + 1
      WHERE id = $1`,
    [poll.id, input.now, closesAt],
  );
  await armPollTimers(tx, poll.id, 'board', closesAt, input.now);
  await stageChanged(tx, state, 'final', 'board', input);
  const after = await loadPollState(tx, poll.id);
  if (after !== undefined) {
    await publishPollHints(tx, after, tallyOf(after), 'poll.updated', { stage: 'board' });
  }
  return true;
}
