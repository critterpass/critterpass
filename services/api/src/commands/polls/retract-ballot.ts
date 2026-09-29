/**
 * `retract_ballot` (docs/api-contracts.md §4.4): the voter takes their ballot back while the poll
 * is open (and allows changing one's mind); they count as pending again.
 */
import { appendDomainEvent, loadPollState, publishPollHints, tallyOf } from '@cp/db';
import { DomainError, retractBallotPayloadSchema, type PollTallyResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { lockPoll, takesBallots, tallyResult, visiblePoll, voteClosed } from './shared';

export const retractBallotCommand = defineCommand({
  name: 'retract_ballot',
  v: 1,
  schema: retractBallotPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visiblePoll(tx, payload.poll_id);
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const state = await lockPoll(tx, payload.poll_id);
    if (!takesBallots(state, ctx.clock.serverNow)) throw voteClosed(state, ctx.uid);
    if (!state.poll.allow_change) {
      throw new DomainError('STATE_INVALID', { reason: 'change_not_allowed' });
    }
    if (!state.ballots.some((ballot) => ballot.user_id === ctx.uid)) {
      return tallyResult(state, ctx.uid);
    }
    return asSystemRole(tx, async () => {
      await tx.query('DELETE FROM ballots WHERE poll_id = $1 AND user_id = $2', [
        state.poll.id,
        ctx.uid,
      ]);
      await appendDomainEvent(tx, {
        type: 'ballot.retracted',
        aggregateKind: 'poll',
        aggregateId: state.poll.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { poll_id: state.poll.id, user_id: ctx.uid },
        crewId: state.poll.crew_id,
        ...(state.poll.trip_id === null ? {} : { tripId: state.poll.trip_id }),
      });
      const after = await loadPollState(tx, state.poll.id);
      if (after === undefined) throw new Error('poll vanished while retracting');
      await publishPollHints(tx, after, tallyOf(after), 'ballot.upserted');
      return tallyResult(after, ctx.uid);
    });
  },
});
