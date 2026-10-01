/**
 * The destination board's organiser controls (doc delta to docs/api-contracts.md §4.4):
 *
 * - `advance_poll_stage {poll_id, pick?}`: GO TO FINAL now with the top two places; a tie for a
 *   final spot answers `STATE_INVALID needs_pick` with the tied places until the organiser picks.
 * - `reopen_board {poll_id}`: back from the final to the board, every place back on it.
 * - `remove_candidate {poll_id, option_id}`: the proposer or the organiser takes a place off the
 *   board (its ballots go with it; the pitch goes back in the deck).
 */
import {
  advanceBoardInTx,
  appendDomainEvent,
  decideOnBallots,
  loadPollState,
  publishPollHints,
  reopenBoardInTx,
  tallyOf,
} from '@cp/db';
import {
  advancePollStagePayloadSchema,
  DomainError,
  removeCandidatePayloadSchema,
  reopenBoardPayloadSchema,
  type PollTallyResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  closeForEveryone,
  isTripOrganiser,
  lockPoll,
  requirePollOrganiser,
  tallyResult,
  visiblePoll,
} from './shared';

export const advancePollStageCommand = defineCommand({
  name: 'advance_poll_stage',
  v: 1,
  schema: advancePollStagePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requirePollOrganiser(tx, await visiblePoll(tx, payload.poll_id), ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const state = await lockPoll(tx, payload.poll_id);
    return asSystemRole(tx, async () => {
      const outcome = await advanceBoardInTx(tx, state, {
        now: ctx.clock.serverNow,
        actorId: ctx.uid,
        ...(payload.pick === undefined ? {} : { pick: payload.pick }),
      });
      if (outcome.outcome === 'needs_pick') {
        throw new DomainError('STATE_INVALID', {
          reason: 'needs_pick',
          tied_option_ids: outcome.tiedOptionIds,
          settled_option_ids: outcome.settled,
        });
      }
      if (outcome.outcome !== 'advanced') {
        throw new DomainError('STATE_INVALID', { reason: outcome.outcome });
      }
      const final = (await loadPollState(tx, state.poll.id)) ?? state;
      // Ballots on the two finalists carry into the final. When they already decide it (everyone
      // voted for a finalist), close now: nobody has a reason to vote again.
      const verdict = await decideOnBallots(tx, final);
      if (!verdict.decided) return tallyResult(final, ctx.uid);
      await closeForEveryone(tx, final, {
        reason: verdict.reason,
        now: ctx.clock.serverNow,
        actorId: ctx.uid,
        deciderWinner: verdict.winnerOptionId,
      });
      return tallyResult((await loadPollState(tx, state.poll.id)) ?? final, ctx.uid);
    });
  },
});

export const reopenBoardCommand = defineCommand({
  name: 'reopen_board',
  v: 1,
  schema: reopenBoardPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requirePollOrganiser(tx, await visiblePoll(tx, payload.poll_id), ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const state = await lockPoll(tx, payload.poll_id);
    return asSystemRole(tx, async () => {
      const reopened = await reopenBoardInTx(tx, state, {
        now: ctx.clock.serverNow,
        actorId: ctx.uid,
      });
      if (!reopened) throw new DomainError('STATE_INVALID', { reason: 'not_in_final' });
      return tallyResult((await loadPollState(tx, state.poll.id)) ?? state, ctx.uid);
    });
  },
});

export const removeCandidateCommand = defineCommand({
  name: 'remove_candidate',
  v: 1,
  schema: removeCandidatePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const state = await visiblePoll(tx, payload.poll_id);
    const option = state.options.find((candidate) => candidate.id === payload.option_id);
    if (option === undefined) throw new DomainError('NOT_FOUND', { reason: 'option' });
    const allowed =
      option.proposed_by === ctx.uid ||
      state.poll.created_by === ctx.uid ||
      (await isTripOrganiser(tx, state.poll.trip_id));
    if (!allowed) throw new DomainError('FORBIDDEN', { reason: 'proposer_or_organiser' });
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const state = await lockPoll(tx, payload.poll_id);
    if (state.poll.status !== 'open' || state.poll.stage !== 'board') {
      throw new DomainError('STATE_INVALID', { reason: 'board_only' });
    }
    const option = state.options.find((candidate) => candidate.id === payload.option_id);
    if (option === undefined) return tallyResult(state, ctx.uid);
    return asSystemRole(tx, async () => {
      await tx.query('DELETE FROM poll_options WHERE id = $1', [option.id]);
      if (option.pitch_id !== null) {
        await tx.query("UPDATE pitches SET status = 'back_in_deck' WHERE id = $1", [
          option.pitch_id,
        ]);
      }
      await appendDomainEvent(tx, {
        type: 'poll.candidate_removed',
        aggregateKind: 'poll',
        aggregateId: state.poll.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { poll_id: state.poll.id, option_id: option.id },
        crewId: state.poll.crew_id,
        ...(state.poll.trip_id === null ? {} : { tripId: state.poll.trip_id }),
      });
      const after = (await loadPollState(tx, state.poll.id)) ?? state;
      await publishPollHints(tx, after, tallyOf(after), 'poll.updated');
      return tallyResult(after, ctx.uid);
    });
  },
});
