/**
 * Wire schemas for the invite and seat commands (docs/api-contracts.md §4.2): create, accept,
 * defer, decline and revoke an invite, join a trip already locked in, promote the waitlist and
 * accept a seat offer, plus the seat-limit detail a full trip answers with.
 */
import { z } from 'zod';

import { seatLimitDetailSchema } from '../entitlements/errors';
import { LINK_CHANNELS } from '../links/grammar';
import { tasteTagSchema } from '../taste/taxonomy';

import { INVITE_TTL_MAX_DAYS } from './machine';

export const INVITE_NOTE_MAX = 140;
export const INVITE_NAME_MAX = 60;

/** Where the inviter shares the link; `app` = an in-app invite to someone already on CritterPass. */
export const INVITE_SHARE_CHANNELS = [...LINK_CHANNELS, 'app'] as const;
export const inviteShareChannelSchema = z.enum(INVITE_SHARE_CHANNELS);
export type InviteShareChannel = z.infer<typeof inviteShareChannelSchema>;

export const inviteContactSchema = z.object({
  /** First name as it appears in the inviter's contact card. */
  name: z.string().trim().min(1).max(INVITE_NAME_MAX),
  /** E.164; hashed for matching, never stored. */
  phone_e164: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/)
    .optional(),
  /** Home airport hint (IATA) the app derived from the phone's country code. */
  home_hint: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  provenance: z.enum(['contacts', 'typed']).default('contacts'),
});
export type InviteContact = z.infer<typeof inviteContactSchema>;

export const createInvitePayloadSchema = z
  .object({
    crew_id: z.uuid(),
    trip_id: z.uuid().optional(),
    /** `contact`: a personal seat for a picked contact; `link`/`code`: a generic crew or trip invite. */
    channel: z.enum(['link', 'code', 'contact']),
    share_via: inviteShareChannelSchema.optional(),
    contact: inviteContactSchema.optional(),
    /** An existing CritterPass user in a shared crew, invited in-app. */
    invitee_uid: z.uuid().optional(),
    note: z.string().trim().max(INVITE_NOTE_MAX).optional(),
    /** Tags the inviter confirmed (the guide's inference is only ever a suggestion). */
    tags: z.array(tasteTagSchema).max(3).optional(),
    ttl_days: z.int().min(1).max(INVITE_TTL_MAX_DAYS).optional(),
    /** Retry after `SEAT_LIMIT` choosing the waitlist: the invite then waitlists its invitee. */
    on_full: z.enum(['waitlist']).optional(),
  })
  .refine((value) => value.channel !== 'contact' || value.contact !== undefined, {
    message: 'a contact invite names the contact',
    path: ['contact'],
  })
  .refine((value) => value.channel === 'contact' || value.contact === undefined, {
    message: 'only a contact invite carries a contact',
    path: ['contact'],
  });
export type CreateInvitePayload = z.infer<typeof createInvitePayloadSchema>;

export interface CreateInviteResult {
  readonly invite_id: string;
  readonly code: string;
  /** The link path (`/i/{code}` or `/i/{code}/{seat}`) and its full URL. */
  readonly link: string;
  readonly url: string;
  readonly expires_at: string;
  /** True when the trip was full and the invitee will join its waitlist. */
  readonly waitlisted: boolean;
}

export const acceptInvitePayloadSchema = z
  .object({
    /** A crew or trip code, typed or taken from a link. */
    code: z.string().min(1).max(16).optional(),
    /** The seat token of a personal link (`/i/{code}/{seat}`). */
    seat: z.string().min(1).max(64).optional(),
    /** An in-app invite addressed to the caller. */
    invite_id: z.uuid().optional(),
  })
  .refine((value) => (value.code === undefined) !== (value.invite_id === undefined), {
    message: 'give a code or an invite id',
  })
  .refine((value) => value.seat === undefined || value.code !== undefined, {
    message: 'a seat comes with its code',
    path: ['seat'],
  });
export type AcceptInvitePayload = z.infer<typeof acceptInvitePayloadSchema>;

export interface AcceptInviteResult {
  readonly crew_id: string;
  /**
   * The trip the seat fields describe: the invite's own trip, or for a crew join the crew's trip
   * that is confirmed or under way (the one under way, else the next to start). Null when the join
   * is to the crew alone.
   */
  readonly trip_id: string | null;
  readonly invite_id: string | null;
  /** Joined the crew in this call (false when already a member). */
  readonly joined: boolean;
  readonly seated: boolean;
  readonly waitlisted: boolean;
  readonly waitlist_position: number | null;
  /** The link was a personal one opened by someone other than its invitee. */
  readonly forwarded: boolean;
}

export const joinTripPayloadSchema = z.object({ trip_id: z.uuid() });
export type JoinTripPayload = z.infer<typeof joinTripPayloadSchema>;

export interface JoinTripResult {
  readonly trip_id: string;
  readonly seated: boolean;
  /** The trip was full: the caller holds a waitlist place instead of a seat. */
  readonly waitlisted: boolean;
  readonly waitlist_position: number | null;
  /** With `waitlisted`: the cap that was reached, and whether a Boost could still raise it. */
  readonly cap?: number;
  readonly boost_active?: boolean;
}

export const inviteIdPayloadSchema = z.object({ invite_id: z.uuid() });
export type InviteIdPayload = z.infer<typeof inviteIdPayloadSchema>;

export const promoteWaitlistPayloadSchema = z.object({ trip_id: z.uuid() });
export type PromoteWaitlistPayload = z.infer<typeof promoteWaitlistPayloadSchema>;

export interface PromoteWaitlistResult {
  readonly trip_id: string;
  readonly offers: readonly { readonly offer_id: string; readonly user_id: string }[];
}

export const acceptSeatOfferPayloadSchema = z.object({ offer_id: z.uuid() });
export type AcceptSeatOfferPayload = z.infer<typeof acceptSeatOfferPayloadSchema>;

/** A seat offer stays open this long; an unanswered one passes to the next person waiting. */
export const SEAT_OFFER_WINDOW_HOURS = 24;

/** `SEAT_LIMIT` from an invite path: the seat-limit detail plus who could not be seated. */
export const inviteSeatLimitDetailSchema = seatLimitDetailSchema.extend({
  trip_id: z.uuid(),
  invitee: z.string().nullable(),
  seats_taken: z.int().nonnegative(),
});
export type InviteSeatLimitDetail = z.infer<typeof inviteSeatLimitDetailSchema>;
