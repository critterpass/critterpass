/**
 * Expense detail rules: who may edit or delete (whoever added it, whoever paid, or an organiser),
 * what each edit in the history changed, and the FX line ("1 USD = 15,835 IDR on 14 Oct").
 */
import { json, type EditRow, type FxRow } from '../data/queries';

export type EditField = 'amount' | 'payer' | 'split' | 'what' | 'category' | 'when';

interface Snapshot {
  readonly payer_id?: string;
  readonly amount_minor?: number | string;
  readonly currency?: string;
  readonly split_mode?: string;
  readonly category?: string;
  readonly description?: string;
  readonly merchant?: string | null;
  readonly spent_at?: string;
  readonly shares?: readonly { readonly user_id: string; readonly computed_minor: number }[];
}

/** The fields an `edited` history row changed, in reading order. */
export function changedFields(edit: Pick<EditRow, 'before' | 'after'>): EditField[] {
  const before = json<Snapshot>(edit.before, {});
  const after = json<Snapshot>(edit.after, {});
  const fields: EditField[] = [];
  if (
    String(before.amount_minor) !== String(after.amount_minor) ||
    before.currency !== after.currency
  ) {
    fields.push('amount');
  }
  if (before.payer_id !== after.payer_id) fields.push('payer');
  if (
    before.split_mode !== after.split_mode ||
    JSON.stringify(before.shares ?? []) !== JSON.stringify(after.shares ?? [])
  ) {
    if (!fields.includes('amount')) fields.push('split');
  }
  if (before.description !== after.description || before.merchant !== after.merchant) {
    fields.push('what');
  }
  if (before.category !== after.category) fields.push('category');
  if (before.spent_at !== after.spent_at) fields.push('when');
  return fields;
}

export function canChangeExpense(input: {
  readonly uid: string | null;
  readonly createdBy: string | null;
  readonly payerId: string;
  readonly organiser: boolean;
}): boolean {
  if (input.uid === null) return false;
  return input.organiser || input.uid === input.createdBy || input.uid === input.payerId;
}

export interface FxLine {
  /** One unit of `from` is worth `rate` units of `to`. */
  readonly from: string;
  readonly to: string;
  readonly rate: number;
  readonly asOf: string | null;
}

/**
 * The effective rate the expense was converted at, from its own stored amounts (so a cross rate
 * through a base currency reads the same way), oriented so the number is at least 1: "1 USD =
 * 15,835 IDR", never "1 IDR = 0.0000632 USD". Display only.
 */
export function fxLine(input: {
  readonly amountMajor: number;
  readonly currency: string;
  readonly crewAmountMajor: number;
  readonly crewCurrency: string;
  readonly snapshot: Pick<FxRow, 'as_of'> | null;
}): FxLine | null {
  if (input.currency === input.crewCurrency) return null;
  if (input.amountMajor <= 0 || input.crewAmountMajor <= 0) return null;
  const perExpenseUnit = input.crewAmountMajor / input.amountMajor;
  const asOf = input.snapshot?.as_of ?? null;
  return perExpenseUnit >= 1
    ? { from: input.currency, to: input.crewCurrency, rate: perExpenseUnit, asOf }
    : { from: input.crewCurrency, to: input.currency, rate: 1 / perExpenseUnit, asOf };
}
