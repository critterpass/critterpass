/**
 * Money domain events (docs/api-contracts.md §4.9) and the realtime hints on
 * `crew_money:{crew_id}`. Payloads carry ids and enums only: amounts reach devices through the
 * synced rows, never through the event log or a hint.
 */
import { z } from 'zod';

export const MONEY_EVENT_TYPES = [
  'expense.added',
  'expense.edited',
  'expense.deleted',
  'crew.settlement_currency_changed',
  'budget.target_changed',
  'payment.requested',
  'payment.nudged',
  'payment.marked_paid',
  'payment.confirmed',
  'payment.disputed',
  'payment.reminded',
  'trip.settled',
  'profile.payout_set',
  'receipt.parsed',
] as const;
export type MoneyEventType = (typeof MONEY_EVENT_TYPES)[number];

const expense = z.object({ trip_id: z.uuid(), crew_id: z.uuid(), expense_id: z.uuid() });
const payment = z.object({
  crew_id: z.uuid(),
  trip_id: z.uuid().nullable(),
  payment_id: z.uuid(),
  from_id: z.uuid(),
  to_id: z.uuid(),
});

export const MONEY_EVENT_PAYLOADS = {
  'expense.added': expense.extend({
    payer_id: z.uuid(),
    source: z.enum(['manual', 'receipt', 'booking', 'boost', 'ride']),
  }),
  'expense.edited': expense.extend({ version: z.int().positive() }),
  'expense.deleted': expense,
  'crew.settlement_currency_changed': z.object({
    crew_id: z.uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  }),
  'budget.target_changed': z.object({ trip_id: z.uuid() }),
  'payment.requested': payment,
  'payment.nudged': payment,
  'payment.marked_paid': payment,
  'payment.confirmed': payment.extend({ auto: z.boolean() }),
  'payment.disputed': payment,
  'payment.reminded': z.object({
    crew_id: z.uuid(),
    trip_id: z.uuid(),
    payment_ids: z.array(z.uuid()),
  }),
  // The last open payment of a trip cleared: every participant got the Settled Tokek at `granted_at`.
  'trip.settled': z.object({
    crew_id: z.uuid(),
    trip_id: z.uuid(),
    granted_at: z.iso.datetime({ offset: true }),
    user_ids: z.array(z.uuid()),
  }),
  'profile.payout_set': z.object({
    user_id: z.uuid(),
    kind: z.enum(['bank', 'paynow', 'promptpay', 'vietqr', 'duitnow', 'wise_link', 'cash']),
    removed: z.boolean(),
  }),
  'receipt.parsed': z.object({
    receipt_id: z.uuid(),
    trip_id: z.uuid(),
    status: z.enum(['parsed', 'partial', 'failed']),
  }),
} as const satisfies Record<MoneyEventType, z.ZodType>;

/** Realtime hint types on `crew_money:{crew_id}` (ids only; rows arrive through sync). */
export const MONEY_RT = {
  expenseAdded: 'expense.added',
  expenseEdited: 'expense.edited',
  expenseDeleted: 'expense.deleted',
  balancesUpdated: 'balances.updated',
  paymentStatus: 'payment.status',
  rewardGranted: 'reward.granted',
  currencyChanged: 'currency.changed',
  budgetUpdated: 'budget.updated',
} as const;
