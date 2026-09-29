/**
 * Itemised receipts: each item is split across the members who had it, and service, tax, tip and
 * discount lines are shared pro rata to each member's item subtotal ("BY SHARE"). Every step is a
 * largest-remainder allocation with the payer first on ties, so the member totals sum exactly to
 * the receipt's lines.
 */
import { DomainError } from '@cp/domain';

import { allocateByWeights, payerFirstOrder, type Share } from './split';

export const RECEIPT_LINE_KINDS = ['item', 'service', 'tax', 'discount', 'tip'] as const;
export type ReceiptLineKind = (typeof RECEIPT_LINE_KINDS)[number];

export interface ItemisedLine {
  readonly lineId: string;
  readonly kind: ReceiptLineKind;
  /** Positive minor units; a discount is entered as the amount it takes off. */
  readonly amountMinor: bigint;
  /** Items only: who had it; empty means everyone in the split. */
  readonly assignees?: readonly string[];
}

export interface ItemisedInput {
  /** Everyone in the split, in the order the crew sees them. */
  readonly members: readonly string[];
  readonly payerId: string;
  readonly lines: readonly ItemisedLine[];
}

export interface ItemisedResult {
  readonly totalMinor: bigint;
  /** Per member, in `members` order: their items plus their pro-rata adjustments. */
  readonly shares: readonly Share[];
  /** Per member, in `members` order: their items alone. */
  readonly itemSubtotals: readonly Share[];
}

export function itemisedShares(input: ItemisedInput): ItemisedResult {
  const { members, payerId, lines } = input;
  if (members.length === 0) throw new DomainError('VALIDATION', { reason: 'no_one_in_split' });
  if (new Set(members).size !== members.length) {
    throw new DomainError('VALIDATION', { reason: 'duplicate_member' });
  }
  const people = members.map((userId) => ({ userId }));
  const order = payerFirstOrder(people, payerId);
  const subtotals = members.map(() => 0n);
  let adjustment = 0n;

  for (const line of lines) {
    if (line.amountMinor < 0n) {
      throw new DomainError('VALIDATION', { reason: 'negative_line', line_id: line.lineId });
    }
    if (line.kind !== 'item') {
      adjustment += line.kind === 'discount' ? -line.amountMinor : line.amountMinor;
      continue;
    }
    const assignees = line.assignees ?? [];
    for (const uid of assignees) {
      if (!members.includes(uid)) {
        throw new DomainError('VALIDATION', {
          reason: 'assignee_not_in_split',
          line_id: line.lineId,
        });
      }
    }
    const weights = members.map((uid) =>
      assignees.length === 0 || assignees.includes(uid) ? 1n : 0n,
    );
    const parts = allocateByWeights(line.amountMinor, weights, order);
    parts.forEach((part, index) => {
      subtotals[index] = (subtotals[index] ?? 0n) + part;
    });
  }

  const itemsTotal = subtotals.reduce((sum, value) => sum + value, 0n);
  if (itemsTotal === 0n && adjustment !== 0n) {
    throw new DomainError('VALIDATION', { reason: 'adjustment_without_items' });
  }
  if (itemsTotal + adjustment <= 0n) {
    throw new DomainError('VALIDATION', { reason: 'non_positive' });
  }
  const magnitude = adjustment < 0n ? -adjustment : adjustment;
  const adjustments =
    magnitude === 0n ? members.map(() => 0n) : allocateByWeights(magnitude, subtotals, order);
  const sign = adjustment < 0n ? -1n : 1n;
  return {
    totalMinor: itemsTotal + adjustment,
    shares: members.map((userId, index) => ({
      userId,
      amountMinor: (subtotals[index] ?? 0n) + sign * (adjustments[index] ?? 0n),
    })),
    itemSubtotals: members.map((userId, index) => ({
      userId,
      amountMinor: subtotals[index] ?? 0n,
    })),
  };
}
