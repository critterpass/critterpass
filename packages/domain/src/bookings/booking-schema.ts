/**
 * Booking command payloads (docs/api-contracts.md §4.10, doc delta: client booking id, typed
 * fields, the optional split expense) and the per-kind detail fields the wallet cards show.
 * Instants are ISO 8601 with offset; money is integer minor units.
 */
import { z } from 'zod';

import type { ExpenseCategory } from '../money/expense-schema';
import {
  barcodeFormatSchema,
  bookingAttachmentKindSchema,
  bookingKindSchema,
  bookingStatusSchema,
  bookingSupplierSchema,
  bookingVisibilitySchema,
  type BookingKind,
} from './kinds';

const instant = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().trim().min(1).max(max);
const iata = z.string().regex(/^[A-Z]{3}$/u);
const currency = z.string().regex(/^[A-Z]{3}$/u);

/** One flight leg as printed: `SQ 938 SIN → DPS`. */
export const flightSegmentInputSchema = z.object({
  carrier: z.string().regex(/^[A-Z0-9]{2,3}$/u),
  flight_no: z.string().regex(/^[0-9]{1,4}[A-Z]?$/u),
  dep_airport: iata,
  arr_airport: iata,
  sched_dep_at: instant,
  sched_arr_at: instant.optional(),
  terminal: z.string().max(8).optional(),
  gate: z.string().max(8).optional(),
  boarding_at: instant.optional(),
});
export type FlightSegmentInput = z.infer<typeof flightSegmentInputSchema>;

/**
 * What a card shows beyond the common fields. Every key is optional: an import fills what the
 * confirmation printed and the traveller fills the rest by hand.
 */
export const bookingDetailsSchema = z
  .object({
    /** Stay: room type, guests, check-in and check-out times as printed. */
    room: z.string().max(120),
    guests: z.int().min(1).max(32),
    check_in_time: z.string().max(20),
    check_out_time: z.string().max(20),
    /** Activity, boat, transfer: where to be and the operator's phone as printed. */
    meeting_point: z.string().max(300),
    operator: z.string().max(120),
    /** Flight: this traveller's seat, cabin and bag allowance (the BOARDS/GATE/SEAT/BAG grid). */
    seat: z.string().max(8),
    cabin: z.string().max(40),
    baggage: z.string().max(40),
    /** Rail and car hire: carriage/seat or pick-up and drop-off desks. */
    carriage: z.string().max(20),
    pick_up: z.string().max(300),
    drop_off: z.string().max(300),
    notes: z.string().max(1000),
  })
  .partial()
  .strict();
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;

/**
 * Where a transfer collects the crew, as the server placed its pickup text (`from_text`): on one of
 * the destination's own POIs or a Mapbox address, or `unresolved` when nothing was certain enough,
 * so the same text is never looked up twice. Written by the server only; a client echoes it back.
 */
export const pickupPointSchema = z.union([
  z
    .object({
      from_text: z.string().max(300),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().max(300),
      source: z.enum(['poi', 'mapbox']),
      poi_id: z.uuid().optional(),
    })
    .strict(),
  z.object({ from_text: z.string().max(300), unresolved: z.literal(true) }).strict(),
]);
export type PickupPoint = z.infer<typeof pickupPointSchema>;

/**
 * A booking's details as stored and as a command carries them: what the card shows plus the
 * server's `pickup_point`. Kept apart from `bookingDetailsSchema`, which is also what an import is
 * extracted into, so nothing read from an email can claim a pickup point.
 */
export const storedBookingDetailsSchema = bookingDetailsSchema.extend({
  pickup_point: pickupPointSchema.optional(),
});
export type StoredBookingDetails = z.infer<typeof storedBookingDetailsSchema>;

const priceSchema = z.object({
  amount_minor: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency,
});

const attachmentInputSchema = z.object({
  media_key: z.string().min(1).max(300),
  kind: bookingAttachmentKindSchema,
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .optional(),
});

/** Split the price as an expense on ADD ("Split {n} ways"). */
export const bookingSplitSchema = z.object({
  expense_id: z.uuid(),
  /** Required when the price currency is not the crew's settlement currency. */
  fx_snapshot_id: z.uuid().optional(),
  /** Default: an even split between the booking's travellers. */
  shares: z
    .array(z.object({ user_id: z.uuid(), weight: z.int().min(1).max(100).optional() }))
    .min(1)
    .max(32)
    .optional(),
});
export type BookingSplit = z.infer<typeof bookingSplitSchema>;

/** A boarding pass or voucher code as scanned; sealed at rest, shown only to the owner. */
export const barcodeInputSchema = z.object({
  format: barcodeFormatSchema,
  payload: z.string().min(1).max(4000),
});
export type BarcodeInput = z.infer<typeof barcodeInputSchema>;

const bookingFields = {
  title: text(140),
  starts_at: instant.optional(),
  ends_at: instant.optional(),
  tz: z.string().min(1).max(64).optional(),
  location: z.string().trim().max(300).optional(),
  traveller_ids: z.array(z.uuid()).min(1).max(32).optional(),
  price: priceSchema.optional(),
  paid_by: z.uuid().optional(),
  supplier: bookingSupplierSchema.optional(),
  supplier_ref: z.string().trim().min(1).max(64).optional(),
  free_cancel_until: instant.optional(),
  cancel_policy_text: z.string().trim().max(2000).optional(),
  details: storedBookingDetailsSchema.optional(),
  barcode: barcodeInputSchema.optional(),
};

export const addBookingPayloadSchema = z
  .object({
    /** Client UUIDv7 so an offline add is idempotent and the card can render before sync. */
    booking_id: z.uuid(),
    trip_id: z.uuid(),
    kind: bookingKindSchema,
    ...bookingFields,
    visibility: bookingVisibilitySchema.optional(),
    /** Flights: their legs, in order. */
    segments: z.array(flightSegmentInputSchema).min(1).max(8).optional(),
    attachments: z.array(attachmentInputSchema).max(10).optional(),
    split: bookingSplitSchema.optional(),
  })
  .refine((value) => (value.kind === 'flight') === (value.segments !== undefined), {
    message: 'a flight has segments and nothing else does',
    path: ['segments'],
  })
  .refine((value) => value.split === undefined || value.price !== undefined, {
    message: 'a split needs a price',
    path: ['split'],
  });
export type AddBookingPayload = z.infer<typeof addBookingPayloadSchema>;

export const editBookingPayloadSchema = z.object({
  booking_id: z.uuid(),
  base_version: z.int().positive(),
  patch: z
    .object({
      ...bookingFields,
      title: text(140).optional(),
      status: bookingStatusSchema.optional(),
      segments: z.array(flightSegmentInputSchema).min(1).max(8).optional(),
      /** Attachments to add; `remove_attachments` names media keys to drop. */
      attachments: z.array(attachmentInputSchema).max(10).optional(),
      remove_attachments: z.array(z.string().min(1).max(300)).max(10).optional(),
      /** `null` clears a field that may be empty. */
      clear: z
        .array(
          z.enum([
            'starts_at',
            'ends_at',
            'location',
            'price',
            'paid_by',
            'supplier_ref',
            'free_cancel_until',
            'cancel_policy_text',
            'barcode',
          ]),
        )
        .max(10)
        .optional(),
    })
    .strict(),
});
export type EditBookingPayload = z.infer<typeof editBookingPayloadSchema>;

export const deleteBookingPayloadSchema = z.object({
  booking_id: z.uuid(),
  base_version: z.int().positive().optional(),
  /** Also delete the expense this booking was split as (default: the expense stays). */
  delete_expense: z.boolean().optional(),
});
export type DeleteBookingPayload = z.infer<typeof deleteBookingPayloadSchema>;

export const setBookingVisibilityPayloadSchema = z.object({
  booking_id: z.uuid(),
  visibility: bookingVisibilitySchema,
});

export const setFlightCrewVisibilityPayloadSchema = z.object({
  booking_id: z.uuid(),
  visible: z.boolean(),
});

export interface BookingResult {
  readonly booking_id: string;
  readonly version: number;
  /** The split expense created with the booking, when there was one. */
  readonly expense_id?: string;
}

/** Which money category a booking's split expense lands in. */
export const EXPENSE_CATEGORY_OF_KIND: Readonly<Record<BookingKind, ExpenseCategory>> = {
  flight: 'transit',
  stay: 'stays',
  activity: 'fun',
  boat: 'transit',
  transfer: 'transit',
  rail: 'transit',
  car: 'transit',
  other: 'other',
};
