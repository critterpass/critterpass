/**
 * `record_proposal_open` (docs/api-contracts.md §4.7): a passive signal. The open is written
 * through `app.record_engagement` (no app_user can read it back). Nothing leaves this command: the
 * crew-level count reaches the organisers from the debounced suggestions job, so its timing never
 * points at one open, and neither the domain event nor the command result names the member.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  PROPOSAL_QUEUES,
  recordProposalOpenPayloadSchema,
  SUGGESTION_DEBOUNCE_MIN,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireRecipient } from './shared';

const ENGAGEMENT_KIND = { open: 'opened', view_slide: 'viewed' } as const;

export const recordProposalOpenCommand = defineCommand({
  name: 'record_proposal_open',
  v: 1,
  schema: recordProposalOpenPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireRecipient(tx, payload.proposal_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
    await tx.query('SELECT app.record_engagement($1, $2, $3)', [
      proposal.id,
      ENGAGEMENT_KIND[payload.kind],
      payload.local_hour ?? null,
    ]);
    await asSystemRole(tx, async () => {
      await appendDomainEvent(tx, {
        type: 'proposal.engagement_counted',
        aggregateKind: 'proposal',
        aggregateId: proposal.id,
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: proposal.trip_id, proposal_id: proposal.id },
        crewId: proposal.crew_id,
        tripId: proposal.trip_id,
      });
      await sendInTx(
        tx,
        PROPOSAL_QUEUES.suggestions,
        { proposal_id: proposal.id },
        { singletonKey: proposal.id, startAfter: SUGGESTION_DEBOUNCE_MIN * 60 },
      );
    });
    return {};
  },
});
