/**
 * `schedule_proposal_followup` (docs/api-contracts.md §4.7): "Still thinking. Ask me on Sunday".
 * The follow-up is the recipient's own (a later one replaces it) and fires once at their local
 * time (N-08, `followup.deliver`). Nobody else learns it was asked for: the event names no one.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  isIanaTimeZone,
  localSchedule,
  scheduleProposalFollowupPayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireRecipient, returned } from './shared';

export const scheduleProposalFollowupCommand = defineCommand({
  name: 'schedule_proposal_followup',
  v: 1,
  schema: scheduleProposalFollowupPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireRecipient(tx, payload.proposal_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
    const tz = payload.tz ?? ctx.device.tz;
    if (!isIanaTimeZone(tz)) throw new DomainError('VALIDATION', { field: 'tz' });
    const [date, time] = payload.at_local.split('T') as [string, string];
    const dueAt = localSchedule({ date, time, tz });
    if (dueAt.getTime() <= ctx.clock.serverNow.getTime()) {
      throw new DomainError('VALIDATION', { field: 'at_local', reason: 'in_past' });
    }
    return asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE proposal_followups SET status = 'cancelled'
          WHERE proposal_id = $1 AND user_id = $2 AND kind = 'followup' AND status = 'scheduled'`,
        [proposal.id, ctx.uid],
      );
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO proposal_followups (proposal_id, trip_id, user_id, kind, due_at)
         VALUES ($1, $2, $3, 'followup', $4) RETURNING id`,
        [proposal.id, proposal.trip_id, ctx.uid, dueAt],
      );
      const followupId = returned(inserted.rows).id;
      await tx.query(
        `UPDATE private_guide_threads SET follow_up_at = $3
          WHERE proposal_id = $1 AND owner_id = $2`,
        [proposal.id, ctx.uid, dueAt],
      );
      await appendDomainEvent(tx, {
        type: 'followup.scheduled',
        aggregateKind: 'proposal_followup',
        aggregateId: followupId,
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: proposal.trip_id, proposal_id: proposal.id },
        crewId: proposal.crew_id,
        tripId: proposal.trip_id,
      });
      return { followup_id: followupId, due_at: dueAt.toISOString() };
    });
  },
});
