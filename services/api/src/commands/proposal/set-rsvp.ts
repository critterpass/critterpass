/**
 * `set_rsvp` (docs/api-contracts.md §4.7): a recipient answers IN, MAYBE or OUT, with the personal
 * options they picked (skip a day, a cheaper room) kept on their own participant row. IN past the
 * seat cap is kept as a waitlist place (`SEAT_CAP_REACHED`); OUT frees the seat and starts the
 * re-split. The hype bar counts boardings, never opens.
 */
import { setRsvpPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { declineSeat, replyWithSeat } from './rsvp';
import { recomputeHype, requireRecipient } from './shared';

export const setRsvpCommand = defineCommand({
  name: 'set_rsvp',
  v: 1,
  schema: setRsvpPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'rsvp',
  authorize: async (tx, payload, ctx) => {
    await requireRecipient(tx, payload.proposal_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
    const scope = {
      tripId: proposal.trip_id,
      crewId: proposal.crew_id,
      uid: ctx.uid,
      proposalId: proposal.id,
    };
    const result =
      payload.status === 'out'
        ? await declineSeat(tx, scope)
        : await replyWithSeat(tx, scope, payload.status);
    if (payload.status !== 'out') {
      await tx.query(
        `UPDATE trip_participants SET chosen_options = $3 WHERE trip_id = $1 AND user_id = $2`,
        [
          proposal.trip_id,
          ctx.uid,
          JSON.stringify({ proposal_id: proposal.id, option_ids: payload.option_ids }),
        ],
      );
    }
    await recomputeHype(tx, proposal);
    return result;
  },
});
