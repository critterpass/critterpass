/**
 * `decline_trip` (docs/api-contracts.md §4.7): a participant confirms they are out. This, and an
 * explicit OUT reply, are the only ways the dropout re-split starts; a reply the guide read as
 * "out" only shows the confirm card that sends this.
 */
import { declineTripPayloadSchema, DomainError } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { declineSeat } from './rsvp';
import { recomputeHype, type ProposalRow } from './shared';

export const declineTripCommand = defineCommand({
  name: 'decline_trip',
  v: 1,
  schema: declineTripPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query(
      'SELECT 1 FROM trips WHERE id = $1 AND app.is_trip_participant(id)',
      [payload.trip_id],
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  },
  handle: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ crew_id: string; proposal_id: string | null }>(
      `SELECT t.crew_id,
              (SELECT p.id FROM proposals p WHERE p.trip_id = t.id AND p.status IN ('sent', 'locked')) AS proposal_id
         FROM trips t WHERE t.id = $1`,
      [payload.trip_id],
    );
    const trip = rows[0];
    if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    const result = await declineSeat(tx, {
      tripId: payload.trip_id,
      crewId: trip.crew_id,
      uid: ctx.uid,
      proposalId: trip.proposal_id,
    });
    if (trip.proposal_id !== null) {
      const proposal = await tx.query<ProposalRow>(
        `SELECT p.id, p.trip_id, $2::uuid AS crew_id, p.status, p.sent_at, p.reply_by,
                p.show_cost, p.personal, false AS organiser
           FROM proposals p WHERE p.id = $1`,
        [trip.proposal_id, trip.crew_id],
      );
      if (proposal.rows[0] !== undefined) await recomputeHype(tx, proposal.rows[0]);
    }
    return result;
  },
});
