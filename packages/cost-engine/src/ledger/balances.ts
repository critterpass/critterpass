/**
 * Member balances from ledger entries: what a member is owed minus what they owe, per member, in
 * one currency. Entries only ever move an amount from one member to another, so the nets of any
 * set of entries sum to zero; a non-zero sum means corrupted input and is refused.
 */
import { DomainError } from '@cp/domain';

export interface LedgerMove {
  readonly debtorId: string;
  readonly creditorId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
}

/** Net per member (positive = owed) over the entries in `currency`; members at zero are kept. */
export function balances(
  entries: readonly LedgerMove[],
  currency: string,
): ReadonlyMap<string, bigint> {
  const nets = new Map<string, bigint>();
  for (const entry of entries) {
    if (entry.currency !== currency) continue;
    nets.set(entry.creditorId, (nets.get(entry.creditorId) ?? 0n) + entry.amountMinor);
    nets.set(entry.debtorId, (nets.get(entry.debtorId) ?? 0n) - entry.amountMinor);
  }
  let sum = 0n;
  for (const net of nets.values()) sum += net;
  if (sum !== 0n) throw new DomainError('INTERNAL', { reason: 'ledger_not_zero_sum' });
  return nets;
}

/** The crew's total spend: the sum of its live expenses' crew-currency amounts. */
export function totalSpent(expenses: readonly { readonly crewAmountMinor: bigint }[]): bigint {
  return expenses.reduce((sum, expense) => sum + expense.crewAmountMinor, 0n);
}
