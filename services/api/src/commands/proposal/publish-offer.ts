/** `publish_offer` (docs/api-contracts.md §4.7): the organiser offers everyone an option. */
import { publishOfferPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { publishOffer, requireAnonymousCrew } from './offers';
import { requireProposalOrganiser } from './shared';

export const publishOfferCommand = defineCommand({
  name: 'publish_offer',
  v: 1,
  schema: publishOfferPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    await requireAnonymousCrew(tx, proposal.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    await publishOffer(tx, proposal, payload.option, ctx.uid);
    return { proposal_id: proposal.id, option: payload.option };
  },
});
