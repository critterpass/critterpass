/**
 * `close_poll` (docs/api-contracts.md §4.4): the poll's creator or the trip organiser ends the vote
 * now; the winner follows the same rules as a deadline close. A destination board does not close,
 * it advances to its final (`advance_poll_stage`). Closing an already closed poll answers with its
 * result.
 */
import { loadPollState } from '@cp/db';
import { closePollPayloadSchema, DomainError, type PollTallyResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  closeForEveryone,
  lockPoll,
  requirePollOrganiser,
  tallyResult,
  visiblePoll,
} from './shared';

export const closePollCommand = defineCommand({
  name: 'close_poll',
  v: 1,
  schema: closePollPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requirePollOrganiser(tx, await visiblePoll(tx, payload.poll_id), ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult> => {
    const state = await lockPoll(tx, payload.poll_id);
    if (state.poll.status !== 'open') return tallyResult(state, ctx.uid);
    if (state.poll.stage === 'board') {
      throw new DomainError('STATE_INVALID', { reason: 'board_advances' });
    }
    return asSystemRole(tx, async () => {
      await closeForEveryone(tx, state, {
        reason: 'manual',
        now: ctx.clock.serverNow,
        actorId: ctx.uid,
      });
      return tallyResult((await loadPollState(tx, state.poll.id)) ?? state, ctx.uid);
    });
  },
});
