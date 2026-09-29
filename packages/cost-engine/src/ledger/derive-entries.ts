/**
 * From an expense's shares to ledger entries in the crew's settlement currency.
 *
 * The expense total is converted once, at the pinned snapshot run (half-even), and that crew
 * amount is allocated across the members in proportion to their exact shares in the expense
 * currency (largest remainder, payer first on ties): the converted shares always sum to the
 * converted total. Each member other than the payer then owes the payer their crew share. A change
 * never edits an entry: it reverses the old ones and derives new ones.
 */
import { DomainError } from '@cp/domain';

import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { convertWith, type FxContext } from '../shares/fx';
import { allocateByWeights, payerFirstOrder, type Share } from './split';

export const LEDGER_SOURCE_KINDS = [
  'expense',
  'payment',
  'boost_iou',
  'adjustment',
  'reversal',
] as const;
export type LedgerSourceKind = (typeof LEDGER_SOURCE_KINDS)[number];

export interface LedgerEntryDraft {
  readonly crewId: string;
  readonly tripId: string | null;
  readonly debtorId: string;
  readonly creditorId: string;
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
  readonly sourceKind: LedgerSourceKind;
  readonly sourceId: string;
  readonly reversesId: string | null;
}

export interface StoredLedgerEntry extends LedgerEntryDraft {
  readonly id: string;
}

export interface CrewShares {
  readonly total: Money;
  /** Aligned with the input shares. */
  readonly shares: readonly Share[];
}

/** Converts an expense and its shares into the crew currency (identity when they match). */
export function toCrewShares(
  total: Money,
  shares: readonly Share[],
  crewCurrency: CurrencyCode,
  fx: FxContext | undefined,
  payerId: string,
): CrewShares {
  const sum = shares.reduce((acc, share) => acc + share.amountMinor, 0n);
  if (sum !== total.amountMinor) {
    throw new DomainError('VALIDATION', { reason: 'shares_do_not_sum' });
  }
  const crewTotal = convertWith(total, crewCurrency, fx);
  if (crewTotal.currency === total.currency) return { total: crewTotal, shares };
  const amounts =
    crewTotal.amountMinor === 0n
      ? shares.map(() => 0n)
      : allocateByWeights(
          crewTotal.amountMinor,
          shares.map((share) => share.amountMinor),
          payerFirstOrder(shares, payerId),
        );
  return {
    total: crewTotal,
    shares: shares.map((share, index) => ({
      userId: share.userId,
      amountMinor: amounts[index] ?? 0n,
    })),
  };
}

export interface ExpenseForLedger {
  readonly id: string;
  readonly crewId: string;
  readonly tripId: string | null;
  readonly payerId: string;
  readonly crewCurrency: CurrencyCode;
  /** Crew-currency shares. */
  readonly crewShares: readonly Share[];
}

/** One entry per member other than the payer who owes a positive crew share. */
export function deriveEntries(expense: ExpenseForLedger): LedgerEntryDraft[] {
  return expense.crewShares
    .filter((share) => share.userId !== expense.payerId && share.amountMinor > 0n)
    .map((share) => ({
      crewId: expense.crewId,
      tripId: expense.tripId,
      debtorId: share.userId,
      creditorId: expense.payerId,
      amountMinor: share.amountMinor,
      currency: expense.crewCurrency,
      sourceKind: 'expense',
      sourceId: expense.id,
      reversesId: null,
    }));
}

/** The reversal of each entry: same amount, debtor and creditor swapped, pointing at it. */
export function reverseEntries(entries: readonly StoredLedgerEntry[]): LedgerEntryDraft[] {
  return entries.map((entry) => {
    if (entry.sourceKind === 'reversal') {
      throw new DomainError('VALIDATION', { reason: 'reversing_a_reversal', entry_id: entry.id });
    }
    return {
      crewId: entry.crewId,
      tripId: entry.tripId,
      debtorId: entry.creditorId,
      creditorId: entry.debtorId,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
      sourceKind: 'reversal',
      sourceId: entry.sourceId,
      reversesId: entry.id,
    };
  });
}

export interface PaymentForLedger {
  readonly id: string;
  readonly crewId: string;
  readonly tripId: string | null;
  readonly fromId: string;
  readonly toId: string;
  readonly amount: Money;
}

/** A confirmed payment: the payee now owes the payer what was paid, cancelling the debt. */
export function paymentEntry(payment: PaymentForLedger): LedgerEntryDraft {
  if (payment.amount.amountMinor <= 0n) {
    throw new DomainError('VALIDATION', { reason: 'non_positive' });
  }
  return {
    crewId: payment.crewId,
    tripId: payment.tripId,
    debtorId: payment.toId,
    creditorId: payment.fromId,
    amountMinor: payment.amount.amountMinor,
    currency: payment.amount.currency,
    sourceKind: 'payment',
    sourceId: payment.id,
    reversesId: null,
  };
}
