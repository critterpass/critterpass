/**
 * Wire contracts for drivers our crews used: the crew's commands (rate, invite, nudge, cancel, add
 * a listed driver to the trip), the member directory reads, the crew's "our drivers" read and the
 * driver's own claim page (public, keyed by the link token).
 */
import { z } from 'zod';

import {
  driverTagSchema,
  driverVerdictSchema,
  DRIVER_TIP_MAX_CHARS,
  type DriverVerdict,
} from './rating';

/** An invite link stays usable this long, then switches off and nothing is listed. */
export const DRIVER_INVITE_TTL_DAYS = 30;
/** A rotated listing key keeps working this long, so a page open in another tab still saves. */
export const DRIVER_KEY_GRACE_HOURS = 24;
/** The consent text shown on the claim page; bump when the copy changes. */
export const DRIVER_CONSENT_VERSION = 'driver-listing-2026-10';
/** The claim page's web path: web-only, never a Universal or App Link. */
export const DRIVER_CLAIM_PATH_PREFIX = '/d/';

export const rateDriverPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  provider_id: z.uuid(),
  verdict: driverVerdictSchema,
  tags: z.array(driverTagSchema).max(8).default([]),
  tip: z.string().trim().max(DRIVER_TIP_MAX_CHARS).optional(),
});
export type RateDriverPayload = z.infer<typeof rateDriverPayloadSchema>;

export const inviteDriverPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  provider_id: z.uuid(),
});
export type InviteDriverPayload = z.infer<typeof inviteDriverPayloadSchema>;
export interface InviteDriverResult {
  readonly invite_id: string;
  /** The single-use link; returned once, never stored. */
  readonly url: string;
  readonly phone_e164: string;
  readonly expires_at: string;
}

export const driverInviteRefPayloadSchema = z.strictObject({ invite_id: z.uuid() });
export type DriverInviteRefPayload = z.infer<typeof driverInviteRefPayloadSchema>;

export const shortlistListedDriverPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  listing_id: z.uuid(),
});
export type ShortlistListedDriverPayload = z.infer<typeof shortlistListedDriverPayloadSchema>;

export const DRIVER_DIRECTORY_SEATS = [4, 7, 10] as const;

export const driverDirectoryQuerySchema = z.object({
  area: z.string().trim().min(1).max(80).optional(),
  lang: z.string().trim().min(2).max(16).optional(),
  seats: z.coerce.number().int().min(1).max(60).optional(),
  day_trips: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type DriverDirectoryQuery = z.infer<typeof driverDirectoryQuerySchema>;

export interface DriverVehicle {
  readonly model?: string | undefined;
  readonly seats?: number | undefined;
  readonly notes?: string | undefined;
}

export interface DriverDirectoryCard {
  readonly id: string;
  readonly display_name: string;
  readonly areas: readonly string[];
  readonly languages: readonly string[];
  readonly vehicle: DriverVehicle | null;
  readonly seats: number | null;
  readonly day_trips: boolean;
  readonly photo_url: string | null;
  readonly listed_at: string;
  /** Null when the driver turned ratings off. */
  readonly crews_loved: number | null;
  readonly crews_rated: number | null;
  readonly trips: number;
  readonly top_tags: readonly string[];
}

export interface DriverDirectoryList {
  readonly drivers: readonly DriverDirectoryCard[];
  /** When nobody matches the area: the nearest listed areas to widen to. */
  readonly nearby_areas: readonly { readonly area: string; readonly drivers: number }[];
}

export interface DriverDirectoryDetail extends DriverDirectoryCard {
  readonly price_text: string | null;
  readonly phone_e164: string;
  readonly tip: {
    readonly id: string;
    readonly text: string;
    readonly crew_size: number;
    readonly month: string;
  } | null;
}

export type DriverInviteStatus =
  'sent' | 'opened' | 'claimed' | 'declined' | 'cancelled' | 'expired';

export interface OurDriver {
  readonly provider_id: string;
  readonly name: string;
  readonly day_numbers: readonly number[];
  readonly crew_loved: number;
  readonly crew_voters: number;
  readonly my_verdict: DriverVerdict | null;
  readonly listing_id: string | null;
  readonly listing_status: 'listed' | 'paused' | null;
  readonly invite: {
    readonly id: string;
    readonly status: DriverInviteStatus;
    readonly sent_at: string;
    readonly opened_at: string | null;
    readonly expires_at: string;
    readonly nudged_at: string | null;
  } | null;
}

export interface OurDrivers {
  readonly trip_id: string;
  readonly crew_size: number;
  readonly drivers: readonly OurDriver[];
}

// The driver's own page (public, keyed by the link token).

export const driverClaimDetailsSchema = z.strictObject({
  display_name: z.string().trim().min(1).max(80),
  areas: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  vehicle_model: z.string().trim().max(80).optional(),
  seats: z.number().int().min(1).max(60).optional(),
  day_trips: z.boolean().default(true),
  price_text: z.string().trim().max(200).optional(),
});
export type DriverClaimDetails = z.infer<typeof driverClaimDetailsSchema>;

export const driverClaimConfirmSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
  details: driverClaimDetailsSchema,
  show_ratings: z.boolean().default(true),
  /** The page's language; the consent record stores which text was shown. */
  lang: z.enum(['en', 'id']).default('en'),
});

export const driverListingPatchSchema = z.strictObject({
  details: driverClaimDetailsSchema.optional(),
  show_ratings: z.boolean().optional(),
});

export const driverListingPauseSchema = z.strictObject({ paused: z.boolean() });

export type DriverClaimState =
  'invited' | 'listed' | 'paused' | 'invalid' | 'used' | 'expired' | 'removed';

export interface DriverClaimView {
  readonly state: DriverClaimState;
  /** Set when the call rotated the key: the page swaps its URL to this one. */
  readonly next_key?: string;
  readonly crew_size?: number;
  readonly masked_phone?: string;
  readonly details?: DriverClaimDetails;
  readonly show_ratings?: boolean;
  readonly crews_loved?: number;
  readonly crews_rated?: number;
  readonly top_tags?: readonly string[];
}

/** `+62 812 •••• 7890`: enough for the driver to recognise his number, not enough to copy it. */
export function maskDriverPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length < 7) return '•••';
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} •••• ${digits.slice(-4)}`;
}

/** `https://wa.me/{e164}?text=`: the user sends it from WhatsApp; we never send for them. */
export function whatsAppLink(phoneE164: string, text: string): string {
  const number = phoneE164.replace(/[^\d]/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** First E.164 number in a provider's stored contact (a bare number or a contact record). */
export function phoneFromContact(contact: string): string | null {
  const match = /\+?\d[\d\s().-]{6,20}\d/.exec(contact);
  if (match === null) return null;
  const digits = match[0].replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
