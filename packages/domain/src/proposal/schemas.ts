/**
 * Proposal and RSVP contracts (docs/api-contracts.md §4.7, docs/api-contracts-proposal.md): the
 * command payloads, the enums the tables check, and the privacy thresholds the handlers and the
 * database share. Passive signals (who opened, who objected privately) never appear in a payload a
 * peer or the organiser can see; only crew-level counts and public replies do.
 */
import { z } from 'zod';

export const PROPOSAL_FORMATS = ['trailer', 'poster', 'postcard'] as const;
export const proposalFormatSchema = z.enum(PROPOSAL_FORMATS);
export type ProposalFormat = z.infer<typeof proposalFormatSchema>;

export const PROPOSAL_STATUSES = ['building', 'sent', 'locked', 'superseded'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_VERSION_STATUSES = ['pending', 'ready', 'fallback', 'failed'] as const;
export type ProposalVersionStatus = (typeof PROPOSAL_VERSION_STATUSES)[number];

/** The replies a recipient may set; `waitlisted` is only ever the server's answer to a full trip. */
export const RSVP_REPLIES = ['in', 'maybe', 'out'] as const;
export const rsvpReplySchema = z.enum(RSVP_REPLIES);
export type RsvpReply = z.infer<typeof rsvpReplySchema>;

/** Quick replies and reactions (3f-2): public by choice, so they may reach the crew. */
export const PROPOSAL_REACTIONS = [
  'okay_wow',
  'six_am',
  'im_in',
  'heart',
  'fire',
  'laugh',
] as const;
export const proposalReactionSchema = z.enum(PROPOSAL_REACTIONS);
export type ProposalReaction = z.infer<typeof proposalReactionSchema>;

export const PRIVATE_REASONS = ['cost', 'dates', 'plan', 'other'] as const;
export const privateReasonSchema = z.enum(PRIVATE_REASONS);
export type PrivateReason = z.infer<typeof privateReasonSchema>;

export const ENGAGEMENT_KINDS = ['open', 'view_slide'] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export const RSVP_SUGGESTION_KINDS = ['resend', 'offer', 'nudge'] as const;
export type RsvpSuggestionKind = (typeof RSVP_SUGGESTION_KINDS)[number];

/**
 * Anonymous suggestions and unattributed objection changes need a crew at least this big: in a
 * smaller crew the timing alone names the person (the same number `app.write_anonymous_suggestion`
 * and `app.write_unattributed_changeset` check).
 */
export const ANONYMOUS_MIN_CREW = 4;

/** Result code of an `in` past the seat cap: the reply is stored as a waitlist place. */
export const SEAT_CAP_REACHED = 'SEAT_CAP_REACHED' as const;

/** Hours a freed seat stays offered to the next person waiting before it moves on. */
export const PROPOSAL_WAITLIST_OFFER_TTL_H = 24;

/** Reply-by reminder lead (N-09) and the suggestion debounce. */
export const REPLY_BY_REMINDER_LEAD_H = 24;
export const SUGGESTION_DEBOUNCE_MIN = 10;

const optionIdSchema = z.string().regex(/^[a-z0-9_:.-]{1,80}$/u);

export const createProposalPayloadSchema = z.object({
  proposal_id: z.uuid().optional(),
  trip_id: z.uuid(),
  config: z.object({
    format: proposalFormatSchema.default('trailer'),
    show_cost: z.boolean().default(true),
    personal: z.boolean().default(true),
    /** Omitted: the default from bookings and trip start (./reply-by.ts). */
    reply_by: z.iso.datetime({ offset: true }).optional(),
    options: z.array(optionIdSchema).max(12).default([]),
  }),
});
export type CreateProposalPayload = z.infer<typeof createProposalPayloadSchema>;

export const proposalIdPayloadSchema = z.object({ proposal_id: z.uuid() });

export const setRsvpPayloadSchema = z.object({
  proposal_id: z.uuid(),
  status: rsvpReplySchema,
  option_ids: z.array(optionIdSchema).max(12).default([]),
});
export type SetRsvpPayload = z.infer<typeof setRsvpPayloadSchema>;

export const reactProposalPayloadSchema = z.object({
  proposal_id: z.uuid(),
  reaction: proposalReactionSchema,
});

export const recordProposalOpenPayloadSchema = z.object({
  proposal_id: z.uuid(),
  kind: z.enum(ENGAGEMENT_KINDS),
  /** The device's local hour, for the crew-level resend-hour rule. */
  local_hour: z.number().int().min(0).max(23).optional(),
});

export const submitPrivateReasonPayloadSchema = z.object({
  proposal_id: z.uuid(),
  reason: privateReasonSchema,
  text: z.string().trim().min(1).max(1000).optional(),
});
export type SubmitPrivateReasonPayload = z.infer<typeof submitPrivateReasonPayloadSchema>;

export const chooseObjectionOptionPayloadSchema = z.object({
  thread_id: z.uuid(),
  option_id: optionIdSchema,
});

export const scheduleProposalFollowupPayloadSchema = z.object({
  proposal_id: z.uuid(),
  /** Local wall time in the recipient's zone, `YYYY-MM-DDTHH:mm`. */
  at_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u),
  tz: z.string().min(1).max(64).optional(),
});

export const rsvpSuggestionPayloadSchema = z.object({ suggestion_id: z.uuid() });

export const publishOfferPayloadSchema = z.object({
  proposal_id: z.uuid(),
  option: z.object({
    kind: z.enum(['cheaper_room', 'skip_day', 'cheaper_stay']),
    id: optionIdSchema,
  }),
});

export const declineTripPayloadSchema = z.object({ trip_id: z.uuid() });

export const setKeepInChatPayloadSchema = z.object({
  crew_id: z.uuid(),
  uid: z.uuid(),
  keep: z.boolean(),
});

/** Realtime event names on `proposal:{id}` and the organiser's `user:#uid`. */
export const PROPOSAL_RT = {
  reaction: 'reaction',
  hype: 'hype_pct',
  rsvpStatus: 'rsvp.status',
  offerPublished: 'offer.published',
  versionProgress: 'proposal.version_progress',
  engagementSummary: 'engagement.summary',
  privateReply: 'proposal.private_reply',
} as const;

/** The anonymous line a private reason may become in a crew of four or more. Never a name. */
export const ANONYMOUS_SUGGESTION_TEXT: Readonly<Record<PrivateReason, string>> = {
  cost: 'Someone asked about cost',
  dates: 'Someone asked about the dates',
  plan: 'Someone asked about the plan',
  other: 'Someone has a question about the trip',
};
