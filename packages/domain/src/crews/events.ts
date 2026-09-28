/**
 * Crew growth domain events (docs/api-contracts.md §4.2): crews created and changed, invites and
 * their answers, seats opened to the waitlist and taken, referral progress. Payloads carry ids and
 * enum values only; never an invitee's name, phone or note.
 */
import { z } from 'zod';

export const GROWTH_EVENT_TYPES = [
  'crew.created',
  'crew.updated',
  'crew.code_rotated',
  'user.active_crew_changed',
  'invite.created',
  'invite.claimed',
  'invite.deferred',
  'invite.declined',
  'invite.revoked',
  'invite.nudged',
  'trip.seat_opened',
  'seat_offer.accepted',
  'referral.progressed',
] as const;
export type GrowthEventType = (typeof GROWTH_EVENT_TYPES)[number];

const crewPayload = z.object({ crew_id: z.uuid() });
const invitePayload = z.object({
  invite_id: z.uuid(),
  crew_id: z.uuid(),
  trip_id: z.uuid().nullable(),
});

export const GROWTH_EVENT_PAYLOADS = {
  'crew.created': crewPayload,
  'crew.updated': crewPayload,
  // Aggregate is the crew; the old code is revoked in the same transaction.
  'crew.code_rotated': crewPayload.extend({ join_code_id: z.uuid() }),
  'user.active_crew_changed': z.object({ user_id: z.uuid(), crew_id: z.uuid() }),
  'invite.created': invitePayload.extend({
    kind: z.enum(['personal', 'generic']),
    /** Set for an in-app invite to someone already on CritterPass. */
    invitee_user_id: z.uuid().nullable(),
  }),
  'invite.claimed': invitePayload.extend({
    user_id: z.uuid(),
    outcome: z.enum(['seated', 'waitlisted', 'crew_only']),
    forwarded: z.boolean(),
  }),
  'invite.deferred': invitePayload,
  'invite.declined': invitePayload,
  'invite.revoked': invitePayload,
  // An installed invitee who has not opened their in-app invite after a day gets one nudge.
  'invite.nudged': invitePayload.extend({ invitee_user_id: z.uuid() }),
  // Aggregate is the seat offer: a freed seat offered to the next person waiting.
  'trip.seat_opened': z.object({
    trip_id: z.uuid(),
    offer_id: z.uuid(),
    user_id: z.uuid(),
    expires_at: z.iso.datetime({ offset: true }),
  }),
  'seat_offer.accepted': z.object({ trip_id: z.uuid(), offer_id: z.uuid(), user_id: z.uuid() }),
  'referral.progressed': z.object({
    referral_id: z.uuid(),
    status: z.enum(['pending', 'joined', 'qualified', 'void']),
  }),
} as const satisfies Record<GrowthEventType, z.ZodType>;
