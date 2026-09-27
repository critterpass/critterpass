/**
 * Largest-remainder allocation: splits an exact `Money` total across weighted shares so the parts
 * always sum back to the total — no rounding drift, ever. Ties (equal remainders) break on
 * ascending `id` so the same input always produces the same output anywhere it is recomputed
 * (server, client, a redrafted expense split).
 */
import { DomainError } from '@cp/domain';

import { type Money } from './money';

export interface AllocationWeight<Id extends string = string> {
  readonly id: Id;
  /** Non-negative; a zero weight (e.g. an excluded member) always resolves to a zero share. */
  readonly weight: bigint;
}

export interface AllocationShare<Id extends string = string> {
  readonly id: Id;
  readonly amount: Money;
}

interface AllocationRow<Id extends string> {
  readonly id: Id;
  readonly index: number;
  readonly share: bigint;
  readonly remainder: bigint;
}

/** Splits `total` across `weights` in proportion to weight, remainder minor units going to the
 * largest fractional remainders first (Hamilton's method), ties broken by ascending `id`. */
export function allocate<Id extends string>(
  total: Money,
  weights: readonly AllocationWeight<Id>[],
): readonly AllocationShare<Id>[] {
  if (weights.length === 0) {
    throw new DomainError('VALIDATION', { reason: 'no_allocation_weights' });
  }

  const seenIds = new Set<Id>();
  let totalWeight = 0n;
  for (const entry of weights) {
    if (entry.weight < 0n) {
      throw new DomainError('VALIDATION', { reason: 'negative_allocation_weight', id: entry.id });
    }
    if (seenIds.has(entry.id)) {
      throw new DomainError('VALIDATION', { reason: 'duplicate_allocation_id', id: entry.id });
    }
    seenIds.add(entry.id);
    totalWeight += entry.weight;
  }
  if (totalWeight <= 0n) {
    throw new DomainError('VALIDATION', { reason: 'non_positive_total_weight' });
  }

  const sign = total.amountMinor < 0n ? -1n : 1n;
  const absTotal = sign === -1n ? -total.amountMinor : total.amountMinor;

  const rows: AllocationRow<Id>[] = weights.map((entry, index) => ({
    id: entry.id,
    index,
    share: (absTotal * entry.weight) / totalWeight,
    remainder: (absTotal * entry.weight) % totalWeight,
  }));

  let leftover = absTotal - rows.reduce((sum, row) => sum + row.share, 0n);

  // Ids are unique (checked above), so sorting on id alone is enough to break remainder ties
  // deterministically; `index` only guards a stable, defined order for `Array#sort`.
  const byRemainderThenId = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return a.index - b.index;
  });

  const bumped = new Set<number>();
  for (const row of byRemainderThenId) {
    if (leftover <= 0n) break;
    bumped.add(row.index);
    leftover -= 1n;
  }

  return rows.map((row) => ({
    id: row.id,
    amount: {
      amountMinor: (row.share + (bumped.has(row.index) ? 1n : 0n)) * sign,
      currency: total.currency,
    },
  }));
}
