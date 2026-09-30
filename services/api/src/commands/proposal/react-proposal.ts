/**
 * `react_proposal` (docs/api-contracts.md §4.7): a quick reply (OKAY WOW, 6AM??, I'M IN) a
 * recipient chose to post. Public by choice, so it floats up the crew's story and counts towards
 * the hype bar.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, PROPOSAL_RT, reactProposalPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { publishProposal, recomputeHype, requireRecipient, returned } from './shared';

export const reactProposalCommand = defineCommand({
  name: 'react_proposal',
  v: 1,
  schema: reactProposalPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
    if (proposal.status !== 'sent')
      throw new DomainError('STATE_INVALID', { state: proposal.status });
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
    const reactionId = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO proposal_reactions (id, proposal_id, trip_id, user_id, kind)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ctx.opId, proposal.id, proposal.trip_id, ctx.uid, payload.reaction],
      );
      return returned(rows).id;
    });
    await publishProposal(tx, proposal.id, PROPOSAL_RT.reaction, {
      reaction_id: reactionId,
      user_id: ctx.uid,
      kind: payload.reaction,
    });
    await appendDomainEvent(tx, {
      type: 'proposal.reacted',
      aggregateKind: 'proposal',
      aggregateId: proposal.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        trip_id: proposal.trip_id,
        proposal_id: proposal.id,
        user_id: ctx.uid,
        reaction: payload.reaction,
      },
      crewId: proposal.crew_id,
      tripId: proposal.trip_id,
    });
    const hype = await recomputeHype(tx, proposal);
    return { reaction_id: reactionId, hype_pct: hype.hype_pct };
  },
});
