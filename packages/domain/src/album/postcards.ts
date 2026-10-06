/**
 * Postcard command payloads (docs/api-contracts.md §4.14): a traveller's postcard from the trip
 * (photo, note, format), sending it to the crew, mailing a printed one (Pass+, one per trip) and
 * the recipient's own postal address. The address is sealed on the server and never shown to the
 * crew, the guide or a model; saving it is the recipient's consent to receive printed postcards,
 * and clearing it withdraws that consent.
 */
import { z } from 'zod';

import { postcardFormatSchema } from './schema';

/** The longest note a format prints legibly (the story card has the most room). */
export const POSTCARD_NOTE_MAX = { classic: 180, square: 140, story: 200 } as const;

export const createPostcardPayloadSchema = z.strictObject({
  /** The app's own id, so an offline draft and its replay are one postcard. */
  postcard_id: z.uuid(),
  trip_id: z.uuid(),
  format: postcardFormatSchema,
  photo_id: z.uuid().nullable(),
  note: z.string().max(200),
});
export type CreatePostcardPayload = z.infer<typeof createPostcardPayloadSchema>;

export const editPostcardPayloadSchema = z.strictObject({
  postcard_id: z.uuid(),
  patch: z
    .strictObject({
      format: postcardFormatSchema.optional(),
      photo_id: z.uuid().nullable().optional(),
      note: z.string().max(200).optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, { message: 'empty patch' }),
});
export type EditPostcardPayload = z.infer<typeof editPostcardPayloadSchema>;

export const sendPostcardPayloadSchema = z.strictObject({
  postcard_id: z.uuid(),
  to_uids: z.array(z.uuid()).min(1).max(50),
});
export type SendPostcardPayload = z.infer<typeof sendPostcardPayloadSchema>;

export interface SendPostcardResult {
  readonly postcard_id: string;
  readonly sent_to: readonly string[];
}

export const mailPostcardPayloadSchema = z.strictObject({ postcard_id: z.uuid() });
export type MailPostcardPayload = z.infer<typeof mailPostcardPayloadSchema>;

export interface MailPostcardResult {
  /** `null` when nobody can be mailed yet: no slot is used, the request cards still go out. */
  readonly mailing_id: string | null;
  /** Crew who get a printed card: an address saved, in a country the printer ships to. */
  readonly recipient_ids: readonly string[];
  /** Crew with no saved address: each gets a request card to add one. */
  readonly missing_address_ids: readonly string[];
  /** Crew whose country the printer does not ship to: they get the digital postcard only. */
  readonly unsupported_ids: readonly string[];
}

/** `GET /v1/me/mailing-address`: whether the caller saved an address, never its fields. */
export interface MailingAddressPresence {
  readonly saved: boolean;
  readonly country: string | null;
}

export interface SaveMailingAddressResult {
  readonly saved: boolean;
}

const line = z.string().trim().min(1).max(120);

export const mailingAddressFieldsSchema = z.strictObject({
  name: line,
  line1: line,
  line2: z.string().trim().max(120).optional(),
  city: line,
  region: z.string().trim().max(80).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .describe('ISO 3166-1 alpha-2'),
});
export type MailingAddressFields = z.infer<typeof mailingAddressFieldsSchema>;

/** `fields: null` clears the address (and with it the consent to receive printed postcards). */
export const saveMailingAddressPayloadSchema = z.strictObject({
  fields: mailingAddressFieldsSchema.nullable(),
});
export type SaveMailingAddressPayload = z.infer<typeof saveMailingAddressPayloadSchema>;

export const POSTCARD_MAILING_STATUSES = [
  'queued',
  'sent',
  'printed',
  'shipped',
  'failed',
] as const;
export const postcardMailingStatusSchema = z.enum(POSTCARD_MAILING_STATUSES);
export type PostcardMailingStatus = z.infer<typeof postcardMailingStatusSchema>;

/**
 * One recipient's progress inside a mailing (`postcard_mailings.tracking.orders[uid]`): the print
 * order's reference, how far it got, and the carrier's tracking link once shipped. No address.
 */
export const postcardMailingOrderSchema = z.object({
  ref: z.string().max(200).nullable(),
  status: postcardMailingStatusSchema,
  carrier: z.string().max(80).optional(),
  tracking_url: z.string().max(500).optional(),
  /** ISO date the card should arrive, when the printer says. */
  eta: z.string().max(40).optional(),
  updated_at: z.string(),
});
export type PostcardMailingOrder = z.infer<typeof postcardMailingOrderSchema>;

export const postcardMailingTrackingSchema = z.object({
  orders: z.record(z.uuid(), postcardMailingOrderSchema).default({}),
});
export type PostcardMailingTracking = z.infer<typeof postcardMailingTrackingSchema>;

const PROGRESS: Readonly<Record<PostcardMailingStatus, number>> = {
  queued: 0,
  sent: 1,
  printed: 2,
  shipped: 3,
  failed: -1,
};

/**
 * A mailing's status from its recipients' orders: the least advanced live order, or `failed` only
 * when every order failed (that frees the payer's one mailing for the trip again).
 */
export function mailingStatusOf(orders: readonly PostcardMailingOrder[]): PostcardMailingStatus {
  const live = orders.filter((order) => order.status !== 'failed');
  if (orders.length > 0 && live.length === 0) return 'failed';
  let least: PostcardMailingStatus = 'shipped';
  for (const order of live) if (PROGRESS[order.status] < PROGRESS[least]) least = order.status;
  return live.length === 0 ? 'queued' : least;
}
