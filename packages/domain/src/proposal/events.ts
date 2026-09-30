/**
 * Proposal and RSVP domain events. Payloads carry ids, enums and counts only, and never tie a
 * member to a passive signal: an open, a private objection or a follow-up they asked for is
 * appended without the member's id, because `domain_events` reaches crew-wide consumers.
 */
import { z } from 'zod';

import { privateReasonSchema, proposalFormatSchema, proposalReactionSchema } from './schemas';

export const PROPOSAL_EVENT_TYPES = [
  'proposal.created',
  'proposal.sent',
  'proposal.reacted',
  'proposal.engagement_counted',
  'proposal.offer_published',
  'proposal.reply_by_soon',
  'proposal.locked',
  'followup.scheduled',
  'followup.due',
  'suggestion.executed',
  'suggestion.dismissed',
  'participant.declined',
  'crew.member_updated',
] as const;
export type ProposalEventType = (typeof PROPOSAL_EVENT_TYPES)[number];

const proposal = z.object({ trip_id: z.uuid(), proposal_id: z.uuid() });

export const PROPOSAL_EVENT_PAYLOADS = {
  'proposal.created': proposal.extend({
    format: proposalFormatSchema,
    recipients: z.number().int().min(0),
  }),
  'proposal.sent': proposal.extend({ recipients: z.number().int().min(0) }),
  'proposal.reacted': proposal.extend({ user_id: z.uuid(), reaction: proposalReactionSchema }),
  // Crew-level only: no member id, no count per person.
  'proposal.engagement_counted': proposal,
  'proposal.offer_published': proposal.extend({ topic: privateReasonSchema }),
  // Members who have not answered and the organiser; replies are public statuses, not signals.
  'proposal.reply_by_soon': proposal.extend({ user_ids: z.array(z.uuid()) }),
  'proposal.locked': proposal.extend({ unanswered: z.number().int().min(0) }),
  'followup.scheduled': proposal,
  // The push resolves its one recipient from the follow-up row; the payload names nobody.
  'followup.due': proposal.extend({ followup_id: z.uuid() }),
  'suggestion.executed': proposal.extend({ suggestion_id: z.uuid() }),
  'suggestion.dismissed': proposal.extend({ suggestion_id: z.uuid() }),
  'participant.declined': z.object({ trip_id: z.uuid(), user_id: z.uuid() }),
  'crew.member_updated': z.object({
    crew_id: z.uuid(),
    user_id: z.uuid(),
    keep_in_chat: z.boolean(),
  }),
} as const satisfies Record<ProposalEventType, z.ZodType>;
