/**
 * `send_proposal` (docs/api-contracts.md §4.7): the organiser sends the built proposal. The crew
 * can see it from now on, the trip moves to `proposed`, and each recipient gets their guide's
 * push (N-07). Sending twice changes nothing.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, proposalIdPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireProposalOrganiser } from './shared';

export const sendProposalCommand = defineCommand({
  name: 'send_proposal',
  v: 1,
  schema: proposalIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    if (proposal.status !== 'building' && proposal.status !== 'sent') {
      throw new DomainError('STATE_INVALID', { state: proposal.status });
    }
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    const { rows } = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proposal_versions WHERE proposal_id = $1',
      [payload.proposal_id],
    );
    const recipients = rows[0]?.n ?? 0;
    if (proposal.status === 'sent') return { proposal_id: proposal.id, recipients };
    if (recipients === 0) throw new DomainError('STATE_INVALID', { reason: 'no_recipients' });
    return asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE proposals SET status = 'sent', sent_at = $2 WHERE id = $1 AND status = 'building'`,
        [proposal.id, ctx.clock.serverNow],
      );
      const moved = await tx.query(
        `UPDATE trips SET status = 'proposed' WHERE id = $1 AND status = 'draft_review'`,
        [proposal.trip_id],
      );
      if ((moved.rowCount ?? 0) > 0) {
        await appendDomainEvent(tx, {
          type: 'trip.status_changed',
          aggregateKind: 'trip',
          aggregateId: proposal.trip_id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { trip_id: proposal.trip_id, from: 'draft_review', to: 'proposed' },
          crewId: proposal.crew_id,
          tripId: proposal.trip_id,
        });
      }
      await appendDomainEvent(tx, {
        type: 'proposal.sent',
        aggregateKind: 'proposal',
        aggregateId: proposal.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { trip_id: proposal.trip_id, proposal_id: proposal.id, recipients },
        crewId: proposal.crew_id,
        tripId: proposal.trip_id,
      });
      return { proposal_id: proposal.id, recipients };
    });
  },
});
