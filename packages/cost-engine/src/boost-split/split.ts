/**
 * Boost split: a consumable bought by one member and split across the members they chose, as IOU
 * amounts owed to the buyer (ledger `boost_iou` entries, no money moves in the app). This is the
 * one deliberate exception to largest-remainder allocation: every other member owes the same
 * floored amount and the buyer absorbs the whole remainder, so nobody is ever asked for the odd
 * cent. Boost flows call this, never the generic allocator.
 */
import { DomainError } from '@cp/domain';

import { type Money } from '../money/money';

export interface BoostIou {
  readonly debtorUid: string;
  readonly creditorUid: string;
  readonly amount: Money;
}

export interface BoostSplit {
  readonly ious: readonly BoostIou[];
  /** What the buyer keeps paying themselves: the floored share plus the remainder. */
  readonly buyerShare: Money;
}

/** `memberUids` are the chosen members including the buyer. */
export function splitBoost(
  total: Money,
  buyerUid: string,
  memberUids: readonly string[],
): BoostSplit {
  if (total.amountMinor < 0n)
    throw new DomainError('VALIDATION', { reason: 'negative_boost_total' });
  const members = [...new Set(memberUids)];
  if (members.length !== memberUids.length) {
    throw new DomainError('VALIDATION', { reason: 'duplicate_boost_member' });
  }
  if (!members.includes(buyerUid)) {
    throw new DomainError('VALIDATION', { reason: 'buyer_not_in_split' });
  }
  const each = total.amountMinor / BigInt(members.length);
  const ious = members
    .filter((uid) => uid !== buyerUid)
    .sort()
    .map((debtorUid) => ({
      debtorUid,
      creditorUid: buyerUid,
      amount: { amountMinor: each, currency: total.currency },
    }))
    .filter((iou) => iou.amount.amountMinor > 0n);
  const owed = each * BigInt(members.length - 1);
  return {
    ious,
    buyerShare: { amountMinor: total.amountMinor - owed, currency: total.currency },
  };
}
