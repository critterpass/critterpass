/**
 * Expense command contracts (docs/api-contracts.md §4.9): add, edit and delete an expense, the
 * trip's budget target and the crew's settlement currency. Amounts are integer minor units in the
 * named ISO 4217 currency; the client supplies the expense id (UUIDv7) so an expense added offline
 * keeps its id when it syncs.
 */
import { z } from 'zod';

export const EXPENSE_SPLIT_MODES = ['equal', 'weights', 'fixed', 'items'] as const;
export const expenseSplitModeSchema = z.enum(EXPENSE_SPLIT_MODES);
export type ExpenseSplitMode = z.infer<typeof expenseSplitModeSchema>;

export const EXPENSE_CATEGORIES = ['stays', 'food', 'transit', 'fun', 'other'] as const;
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const EXPENSE_SOURCES = ['manual', 'receipt', 'booking', 'boost', 'ride'] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

/** A crew has at most 16 seats, so a split never names more people. */
export const MAX_SPLIT_MEMBERS = 16;

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/u, 'ISO 4217 code');
/** Up to 10 million major units in any currency with exponent ≤ 2 (and a lot of dong). */
export const moneyMinorSchema = z.int().min(1).max(100_000_000_000);

export const splitShareSchema = z.strictObject({
  user_id: z.uuid(),
  /** BY SHARE: 0 leaves the member out. */
  weight: z.int().min(0).max(1000).optional(),
  /** CUSTOM: this member's exact amount; all of them must add up to the expense. */
  fixed_minor: z.int().min(0).max(100_000_000_000).optional(),
});
export type SplitShareInput = z.infer<typeof splitShareSchema>;

export const expenseSplitSchema = z.strictObject({
  mode: z.enum(['equal', 'weights', 'fixed']),
  shares: z
    .array(splitShareSchema)
    .min(1)
    .max(MAX_SPLIT_MEMBERS)
    .refine((shares) => new Set(shares.map((share) => share.user_id)).size === shares.length, {
      message: 'a member appears twice',
    }),
});
export type ExpenseSplitInput = z.infer<typeof expenseSplitSchema>;

const description = z.string().trim().max(140);
const merchant = z.string().trim().min(1).max(120);

export const addExpensePayloadSchema = z.strictObject({
  expense_id: z.uuid(),
  trip_id: z.uuid(),
  amount_minor: moneyMinorSchema,
  currency: currencyCodeSchema,
  /** The snapshot the client converted with (offline: the latest cached one); required when the
   * currency is not the crew's settlement currency, and the server converts with the same run. */
  fx_snapshot_id: z.uuid().nullable().default(null),
  payer_uid: z.uuid(),
  split: expenseSplitSchema,
  category: expenseCategorySchema.default('other'),
  description: description.default(''),
  merchant: merchant.optional(),
  /** When it was spent; defaults to when the command ran (trusted device clock). */
  spent_at: z.iso.datetime({ offset: true }).optional(),
  poi_id: z.uuid().optional(),
});
export type AddExpensePayload = z.infer<typeof addExpensePayloadSchema>;

export const editExpensePayloadSchema = z.strictObject({
  expense_id: z.uuid(),
  /** Also accepted on the envelope; a stale version answers `VERSION_CONFLICT`. */
  base_version: z.int().positive().optional(),
  patch: z
    .strictObject({
      amount_minor: moneyMinorSchema.optional(),
      currency: currencyCodeSchema.optional(),
      fx_snapshot_id: z.uuid().nullable().optional(),
      payer_uid: z.uuid().optional(),
      split: expenseSplitSchema.optional(),
      category: expenseCategorySchema.optional(),
      description: description.optional(),
      merchant: merchant.nullable().optional(),
      spent_at: z.iso.datetime({ offset: true }).optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' }),
});
export type EditExpensePayload = z.infer<typeof editExpensePayloadSchema>;

export const deleteExpensePayloadSchema = z.strictObject({
  expense_id: z.uuid(),
  base_version: z.int().positive().optional(),
});
export type DeleteExpensePayload = z.infer<typeof deleteExpensePayloadSchema>;

export interface ExpenseResult {
  readonly expense_id: string;
  readonly version: number;
  readonly crew_amount_minor: number;
  readonly crew_currency: string;
}

export const setTripBudgetPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** The crew's group target, never anyone's private max. */
  target_minor: moneyMinorSchema,
});
export type SetTripBudgetPayload = z.infer<typeof setTripBudgetPayloadSchema>;

export const setCrewSettlementCurrencyPayloadSchema = z.strictObject({
  crew_id: z.uuid(),
  currency: currencyCodeSchema,
});
export type SetCrewSettlementCurrencyPayload = z.infer<
  typeof setCrewSettlementCurrencyPayloadSchema
>;
