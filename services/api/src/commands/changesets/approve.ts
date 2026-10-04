/**
 * `approve_changeset` (docs/api-contracts.md §4.6): a yes or no from an affected member, whichever
 * surface it comes from (app, chat card, the push's Approve/Reject, the widget). The poll row lock
 * serialises ballots; the change set's decider policy decides as soon as it can: approved sets
 * apply at once (unless a booking needs the organiser's confirmation), rejected ones keep the
 * plan. A tie on a majority vote goes to the organiser, whose own ballot or later answer breaks it.
 * Answering again with the same decision changes nothing.
 */
import { appendDomainEvent, loadPollState } from '@cp/db';
import {
  approveChangesetPayloadSchema,
  ballotSourceForVia,
  DomainError,
  PLAN_RT,
  type ChangesetOutcome,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { tripOrganiserIds } from '../../plan/access';
import {
  lockChangeSet,
  outcomeOf,
  publishPlan,
  requireVisibleChangeSet,
  tallyOfPoll,
} from '../../plan/changeset-store';
import { castFirstBallot, settleVote } from '../../plan/changeset-vote';
import { verdict } from '../../plan/decider-policy';
import { defineCommand } from '../_framework/define-command';

export const approveChangesetCommand = defineCommand({
  name: 'approve_changeset',
  v: 1,
  schema: approveChangesetPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'changeset',
  authorize: (tx, payload) => requireVisibleChangeSet(tx, payload.changeset_id),
  handle: async (tx, payload, ctx): Promise<ChangesetOutcome> => {
    const now = ctx.clock.serverNow;
    const row = await lockChangeSet(tx, payload.changeset_id);
    const pollId = row.poll_id;
    if (pollId === null) throw new DomainError('STATE_INVALID', { reason: 'not_sent' });
    const state = await asSystemRole(tx, () => loadPollState(tx, pollId, 'update'));
    if (state === undefined) throw new DomainError('NOT_FOUND', { reason: 'poll' });
    const before = tallyOfPoll(state);
    const optionId = payload.decision === 'yes' ? before.approveOptionId : before.rejectOptionId;
    const mine = state.ballots.find((ballot) => ballot.user_id === ctx.uid);
    if (mine !== undefined && mine.option_id === optionId) return outcomeOf(tx, row.id);
    if (
      row.status !== 'voting' ||
      state.poll.status !== 'open' ||
      (state.poll.closes_at ?? now) < now
    ) {
      throw new DomainError('VOTE_CLOSED', { result: await outcomeOf(tx, row.id) });
    }
    const organisers = await tripOrganiserIds(tx, row.trip_id);
    const facts = {
      policy: state.poll.decider_policy ?? 'majority_of_affected',
      threshold: state.poll.threshold,
      eligible: state.poll.eligible_voter_ids,
      organiserIds: organisers,
    } as const;
    const voter = state.poll.eligible_voter_ids.includes(ctx.uid);
    let tieBreak: 'yes' | 'no' | undefined;
    if (!voter) {
      const tied = verdict({ ...facts, yes: before.yes, no: before.no }) === 'tie';
      if (!(tied && organisers.includes(ctx.uid))) {
        throw new DomainError('NOT_ELIGIBLE', { reason: 'not_affected' });
      }
      tieBreak = payload.decision;
    } else if (mine === undefined) {
      await castFirstBallot(tx, row, {
        pollId,
        optionId,
        uid: ctx.uid,
        via: ctx.via,
        opId: ctx.opId,
        now,
      });
    } else {
      await tx.query(
        `UPDATE ballots SET option_id = $3, source = $4, op_id = $5, cast_at = $6
          WHERE poll_id = $1 AND user_id = $2`,
        [pollId, ctx.uid, optionId, ballotSourceForVia(ctx.via), ctx.opId, now],
      );
    }
    await appendDomainEvent(tx, {
      type: 'change_set.decided',
      aggregateKind: 'change_set',
      aggregateId: row.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        trip_id: row.trip_id,
        change_set_id: row.id,
        user_id: ctx.uid,
        decision: payload.decision,
      },
      crewId: row.crew_id,
      tripId: row.trip_id,
    });
    const result = await settleVote(tx, row, {
      pollId,
      rules: facts,
      uid: ctx.uid,
      ...(tieBreak === undefined ? {} : { tieBreak }),
    });
    const outcome = await outcomeOf(tx, row.id);
    await publishPlan(tx, row.trip_id, PLAN_RT.changesetTally, {
      change_set_id: row.id,
      poll_id: pollId,
      yes: outcome.yes,
      no: outcome.no,
      needed: outcome.needed,
      eligible: outcome.eligible,
      tie: result === 'tie',
    });
    return outcome;
  },
});
