/**
 * `cast_ballot` (docs/api-contracts.md §4.4): one ballot per voter, from any surface (the app, a
 * chat card, a notification action, the vote widget, a Live Activity), changed in place until the
 * poll closes. The poll row lock serialises ballots against each other and against a close, so a
 * burst at the deadline ends with one ballot per voter and one set of tallies; a ballot after the
 * close answers `VOTE_CLOSED` with the result. The last ballot needed closes the poll (everyone
 * voted, or the approval's decider is satisfied); a destination board never closes this way, it
 * advances to its final.
 */
import {
  appendDomainEvent,
  decideOnBallots,
  loadPollState,
  publishPollHints,
  tallyOf,
} from '@cp/db';
import {
  ballotSourceForVia,
  castBallotPayloadSchema,
  DomainError,
  soleLeader,
  type PollTallyResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  closeForEveryone,
  lockPoll,
  takesBallots,
  tallyResult,
  visiblePoll,
  voteClosed,
} from './shared';

export const castBallotCommand = defineCommand({
  name: 'cast_ballot',
  v: 1,
  schema: castBallotPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'ballot',
  authorize: async (tx, payload, ctx) => {
    const state = await visiblePoll(tx, payload.poll_id);
    if (!state.poll.eligible_voter_ids.includes(ctx.uid)) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'not_a_voter' });
    }
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const now = ctx.clock.serverNow;
    const state = await lockPoll(tx, payload.poll_id);
    if (!takesBallots(state, now)) throw voteClosed(state, ctx.uid);
    if (!state.poll.eligible_voter_ids.includes(ctx.uid)) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'not_a_voter' });
    }
    const option = state.options.find(
      (candidate) => candidate.id === payload.option_id && candidate.eliminated_at === null,
    );
    if (option === undefined) throw new DomainError('NOT_FOUND', { reason: 'option' });
    const existing = state.ballots.find((ballot) => ballot.user_id === ctx.uid);
    if (existing?.option_id === option.id) return tallyResult(state, ctx.uid);
    if (existing !== undefined && !state.poll.allow_change) {
      throw new DomainError('STATE_INVALID', { reason: 'change_not_allowed' });
    }
    const source = ballotSourceForVia(ctx.via);
    const before = soleLeader(tallyOf(state));
    // As the voter: RLS (`app.can_vote`) is the backstop for eligibility and the deadline.
    if (existing === undefined) {
      await tx.query(
        `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, source, op_id, cast_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [state.poll.id, option.id, state.poll.crew_id, ctx.uid, source, ctx.opId, now],
      );
    } else {
      await tx.query(
        `UPDATE ballots SET option_id = $3, source = $4, op_id = $5, cast_at = $6
          WHERE poll_id = $1 AND user_id = $2`,
        [state.poll.id, ctx.uid, option.id, source, ctx.opId, now],
      );
    }
    const scope = {
      crewId: state.poll.crew_id,
      ...(state.poll.trip_id === null ? {} : { tripId: state.poll.trip_id }),
    };
    await appendDomainEvent(tx, {
      type: existing === undefined ? 'ballot.cast' : 'ballot.changed',
      aggregateKind: 'poll',
      aggregateId: state.poll.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { poll_id: state.poll.id, user_id: ctx.uid, option_id: option.id, source },
      ...scope,
    });
    return asSystemRole(tx, async () => {
      const after = await loadPollState(tx, state.poll.id);
      if (after === undefined) throw new Error('poll vanished while voting');
      const tally = tallyOf(after);
      const leader = soleLeader(tally);
      if (leader !== null && leader !== before) {
        await appendDomainEvent(tx, {
          type: 'poll.lead_changed',
          aggregateKind: 'poll',
          aggregateId: state.poll.id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { poll_id: state.poll.id, leader_option_id: leader },
          ...scope,
        });
      }
      const verdict = await decideOnBallots(tx, after);
      if (verdict.decided) {
        await closeForEveryone(tx, after, {
          reason: verdict.reason,
          now,
          actorId: ctx.uid,
          deciderWinner: verdict.winnerOptionId,
        });
        const closed = await loadPollState(tx, state.poll.id);
        return tallyResult(closed ?? after, ctx.uid);
      }
      await publishPollHints(tx, after, tally, 'ballot.upserted');
      return tallyResult(after, ctx.uid);
    });
  },
});
