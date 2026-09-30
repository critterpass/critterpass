/**
 * Activity order commands (docs/api-contracts.md §4.11): hold a supplier's activity at booking
 * time (after the crew agreed, never at proposal time), book it with the token from the supplier's
 * own payment form, release a hold, and cancel a booking once its refund quote was shown. The hold
 * id is the order id the app chose, so a replay finds the same order.
 */
import { z } from 'zod';

import { supplierOrderStatusSchema } from './order-state';

const currency = z.string().regex(/^[A-Z]{3}$/);
const code = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const paxBandSchema = z
  .object({
    age_band: z.enum(['ADULT', 'SENIOR', 'YOUTH', 'CHILD', 'INFANT', 'TRAVELER']),
    count: z.number().int().min(1).max(30),
  })
  .strict();

export const holdActivityPayloadSchema = z
  .object({
    hold_id: z.uuid(),
    trip_id: z.uuid(),
    /** The supplier's product code. */
    offer_ref: code,
    option_code: code.optional(),
    date: z.iso.date(),
    time: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    pax: z.array(paxBandSchema).min(1).max(6),
    /** Who goes (default: the caller); each must take part in the trip. */
    participant_ids: z.array(z.uuid()).min(1).max(32).optional(),
    /** The plan item this books, so a vote on it closes before the hold lapses. */
    stable_id: z.uuid().optional(),
    currency,
  })
  .strict();
export type HoldActivityPayload = z.infer<typeof holdActivityPayloadSchema>;

const moneyResult = z.object({ amount_minor: z.number().int().nonnegative(), currency });

export const holdActivityResultSchema = z.object({
  hold_id: z.uuid(),
  status: supplierOrderStatusSchema,
  /** Seats are held (availability `HOLDING`): the only case "held" copy may be shown. */
  hold_provided: z.boolean(),
  seats_held_until: z.iso.datetime().nullable(),
  price_held_until: z.iso.datetime().nullable(),
  /** The supplier's hold would lapse before the crew could agree: book once agreed. */
  book_when_agreed: z.boolean(),
  total: moneyResult.nullable(),
});
export type HoldActivityResult = z.infer<typeof holdActivityResultSchema>;

export const bookActivityPayloadSchema = z
  .object({
    hold_id: z.uuid(),
    /** The wallet title (the product name as the traveller saw it). */
    title: z.string().trim().min(1).max(140),
    traveller_details: z
      .object({
        first_name: z.string().trim().min(1).max(60),
        last_name: z.string().trim().min(1).max(60),
        phone: z.string().regex(/^\+?[0-9 ()-]{6,24}$/),
        email: z.email().optional(),
      })
      .strict(),
    /** Token the supplier's payment form returned; we never see card data. */
    payment_session_ref: z.string().min(1).max(4096),
    answers: z
      .array(
        z
          .object({
            question: z.string().min(1).max(80),
            answer: z.string().min(1).max(500),
            unit: z.string().max(40).optional(),
            traveler_num: z.number().int().min(1).max(99).optional(),
          })
          .strict(),
      )
      .max(60)
      .optional(),
  })
  .strict();
export type BookActivityPayload = z.infer<typeof bookActivityPayloadSchema>;

export const bookActivityResultSchema = z.object({
  hold_id: z.uuid(),
  status: supplierOrderStatusSchema,
  booking_id: z.uuid().nullable(),
  expense_id: z.uuid().nullable(),
});
export type BookActivityResult = z.infer<typeof bookActivityResultSchema>;

export const releaseActivityHoldPayloadSchema = z.object({ hold_id: z.uuid() }).strict();
export type ReleaseActivityHoldPayload = z.infer<typeof releaseActivityHoldPayloadSchema>;

export const cancelActivityBookingPayloadSchema = z
  .object({ booking_id: z.uuid(), reason_code: z.string().regex(/^[A-Za-z0-9_.]{1,120}$/) })
  .strict();
export type CancelActivityBookingPayload = z.infer<typeof cancelActivityBookingPayloadSchema>;

export const cancelQuoteSchema = z.object({
  cancellable: z.boolean(),
  refund: moneyResult.nullable(),
  refund_percentage: z.number().nullable(),
  quoted_at: z.iso.datetime(),
});
export type ActivityCancelQuote = z.infer<typeof cancelQuoteSchema>;

export const orderStatusResultSchema = z.object({
  hold_id: z.uuid(),
  status: supplierOrderStatusSchema,
});
export type OrderStatusResult = z.infer<typeof orderStatusResultSchema>;
