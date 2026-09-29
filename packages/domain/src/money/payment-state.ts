/**
 * The payment state machine (docs/data-model-sync-and-privacy.md §3.6) and the settle-up command
 * contracts. Every transition names who may make it: the payer (`from`), the payee (`to`) or the
 * system (auto-confirm after seven days, a re-issued request). Anything not in the table is
 * `STATE_INVALID`.
 */
import { z } from 'zod';

import { currencyCodeSchema, moneyMinorSchema } from './expense-schema';

export const PAYMENT_STATUSES = [
  'pending',
  'requested',
  'marked_paid',
  'confirmed',
  'disputed',
  'cancelled',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'bank',
  'paynow',
  'promptpay',
  'vietqr',
  'duitnow',
  'wise',
  'cash',
  'other',
] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export type PaymentAction =
  'mark_paid' | 'confirm' | 'dispute' | 'nudge' | 'auto_confirm' | 'cancel';
export type PaymentActor = 'payer' | 'payee' | 'system';

export interface PaymentTransition {
  readonly from: readonly PaymentStatus[];
  /** `null`: the status stays (a nudge). */
  readonly to: PaymentStatus | null;
  readonly actor: PaymentActor;
}

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentAction, PaymentTransition>> = {
  mark_paid: { from: ['pending', 'requested', 'disputed'], to: 'marked_paid', actor: 'payer' },
  // The payee may confirm money they received even if the payer never marked it.
  confirm: {
    from: ['pending', 'requested', 'marked_paid', 'disputed'],
    to: 'confirmed',
    actor: 'payee',
  },
  dispute: { from: ['marked_paid'], to: 'disputed', actor: 'payee' },
  nudge: { from: ['pending', 'requested'], to: null, actor: 'payee' },
  auto_confirm: { from: ['marked_paid'], to: 'confirmed', actor: 'system' },
  cancel: { from: ['pending', 'requested'], to: 'cancelled', actor: 'system' },
};

/** The status after `action`, or `null` when the table does not allow it from `status`. */
export function nextPaymentStatus(
  status: PaymentStatus,
  action: PaymentAction,
): PaymentStatus | null {
  const transition = PAYMENT_TRANSITIONS[action];
  if (!transition.from.includes(status)) return null;
  return transition.to ?? status;
}

/** Statuses a payment is still open in (it blocks the Settled Tokek, and its payer may reveal). */
export const OPEN_PAYMENT_STATUSES = ['pending', 'requested', 'marked_paid', 'disputed'] as const;

export const requestPaymentPayloadSchema = z.strictObject({
  /** Client UUIDv7, so a request made offline keeps its id. */
  payment_id: z.uuid(),
  trip_id: z.uuid(),
  /** Who owes the caller. */
  from_uid: z.uuid(),
  amount_minor: moneyMinorSchema,
  currency: currencyCodeSchema,
});
export type RequestPaymentPayload = z.infer<typeof requestPaymentPayloadSchema>;

export const paymentIdPayloadSchema = z.strictObject({ payment_id: z.uuid() });

export const markPaidPayloadSchema = z.strictObject({
  payment_id: z.uuid(),
  method: paymentMethodSchema,
  /** A partial payment: the rest stays open as its own payment. */
  amount_minor: moneyMinorSchema.optional(),
  /** Paying a planned transfer nobody has requested yet creates the payment under `payment_id`. */
  create: z
    .strictObject({
      trip_id: z.uuid(),
      to_uid: z.uuid(),
      amount_minor: moneyMinorSchema,
      currency: currencyCodeSchema,
    })
    .optional(),
});
export type MarkPaidPayload = z.infer<typeof markPaidPayloadSchema>;

export const disputePaymentPayloadSchema = z.strictObject({
  payment_id: z.uuid(),
  note: z.string().trim().max(280).optional(),
});

export const remindAllPaymentsPayloadSchema = z.strictObject({ trip_id: z.uuid() });

export interface PaymentResult {
  readonly payment_id: string;
  readonly status: PaymentStatus;
  readonly version: number;
  /** The open remainder of a partial payment. */
  readonly remainder_payment_id?: string;
  /** Set when this confirm cleared the trip: every participant got the Settled Tokek at this time. */
  readonly settled_at?: string;
}
