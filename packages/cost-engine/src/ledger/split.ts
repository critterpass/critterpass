/**
 * Expense splits: who owes what of one expense, in the expense's own currency, exactly.
 *
 * Allocation rule (every mode): each member's exact proportional share is floored, and the minor
 * units left over go one each to the largest fractional remainders. Equal remainders break in a
 * stable order: the payer first (the payer absorbs the odd unit, so nobody else is asked for it),
 * then the members in the order given. The shares always sum to the total, and no share is more
 * than one minor unit away from its exact proportion.
 */
import { DomainError } from '@cp/domain';

import { type Money } from '../money/money';

export const SPLIT_MODES = ['equal', 'weights', 'fixed'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export interface SplitMember {
  readonly userId: string;
  /** `weights` mode: a non-negative integer (0 = excluded). Ignored by `equal` and `fixed`. */
  readonly weight?: number;
  /** `fixed` mode: this member's exact amount in the expense's minor units. */
  readonly fixedMinor?: bigint;
}

export interface SplitInput {
  readonly total: Money;
  readonly mode: SplitMode;
  /** Everyone in the split, in the order the crew sees them. */
  readonly members: readonly SplitMember[];
  readonly payerId: string;
}

export interface Share {
  readonly userId: string;
  readonly amountMinor: bigint;
}

/** Members in tie-break order: the payer first, then as given. */
function tieOrder<T extends { readonly userId: string }>(
  members: readonly T[],
  payerId: string,
): number[] {
  const indexes = members.map((_, index) => index);
  const payerIndex = members.findIndex((member) => member.userId === payerId);
  if (payerIndex <= 0) return indexes;
  return [payerIndex, ...indexes.filter((index) => index !== payerIndex)];
}

/**
 * Largest-remainder allocation of a non-negative `total` by non-negative bigint `weights`, ties
 * going to the earlier position in `order`. Returns amounts aligned with `weights`.
 */
export function allocateByWeights(
  total: bigint,
  weights: readonly bigint[],
  order: readonly number[] = weights.map((_, index) => index),
): bigint[] {
  if (total < 0n) throw new DomainError('VALIDATION', { reason: 'negative_total' });
  const weightSum = weights.reduce((sum, weight) => {
    if (weight < 0n) throw new DomainError('VALIDATION', { reason: 'negative_weight' });
    return sum + weight;
  }, 0n);
  if (weightSum === 0n) throw new DomainError('VALIDATION', { reason: 'no_one_in_split' });
  const shares = weights.map((weight) => (total * weight) / weightSum);
  const remainders = weights.map((weight) => (total * weight) % weightSum);
  let leftover = total - shares.reduce((sum, share) => sum + share, 0n);
  const rank = new Map(order.map((index, position) => [index, position]));
  const byRemainder = weights
    .map((_, index) => index)
    .sort((a, b) => {
      const ra = remainders[a] ?? 0n;
      const rb = remainders[b] ?? 0n;
      if (ra !== rb) return ra > rb ? -1 : 1;
      return (rank.get(a) ?? a) - (rank.get(b) ?? b);
    });
  for (const index of byRemainder) {
    if (leftover === 0n) break;
    if ((weights[index] ?? 0n) === 0n) continue;
    shares[index] = (shares[index] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return shares;
}

function assertUniqueMembers(members: readonly { readonly userId: string }[]): void {
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member.userId)) {
      throw new DomainError('VALIDATION', { reason: 'duplicate_member', user_id: member.userId });
    }
    seen.add(member.userId);
  }
}

function weightOf(member: SplitMember): bigint {
  const weight = member.weight ?? 1;
  if (!Number.isInteger(weight) || weight < 0) {
    throw new DomainError('VALIDATION', { reason: 'invalid_weight', user_id: member.userId });
  }
  return BigInt(weight);
}

/** Each member's share of `input.total` under its split mode, in `input.members` order. */
export function computeExpenseShares(input: SplitInput): readonly Share[] {
  const { total, members, payerId } = input;
  if (members.length === 0) throw new DomainError('VALIDATION', { reason: 'no_one_in_split' });
  assertUniqueMembers(members);
  if (total.amountMinor <= 0n) throw new DomainError('VALIDATION', { reason: 'non_positive' });

  if (input.mode === 'fixed') {
    const amounts = members.map((member) => {
      const fixed = member.fixedMinor ?? 0n;
      if (fixed < 0n) {
        throw new DomainError('VALIDATION', { reason: 'negative_share', user_id: member.userId });
      }
      return fixed;
    });
    const assigned = amounts.reduce((sum, amount) => sum + amount, 0n);
    if (assigned !== total.amountMinor) {
      throw new DomainError('VALIDATION', {
        reason: 'fixed_mismatch',
        left_minor: (total.amountMinor - assigned).toString(),
      });
    }
    return members.map((member, index) => ({
      userId: member.userId,
      amountMinor: amounts[index] ?? 0n,
    }));
  }

  const weights = members.map((member) => (input.mode === 'equal' ? 1n : weightOf(member)));
  const amounts = allocateByWeights(total.amountMinor, weights, tieOrder(members, payerId));
  return members.map((member, index) => ({
    userId: member.userId,
    amountMinor: amounts[index] ?? 0n,
  }));
}

/** The "{amount} each" figure a screen shows for an even split: the per-head amount, half up. */
export function perHeadMinor(total: bigint, heads: number): bigint {
  if (!Number.isInteger(heads) || heads <= 0) {
    throw new DomainError('VALIDATION', { reason: 'no_one_in_split' });
  }
  const count = BigInt(heads);
  const quotient = total / count;
  return (total % count) * 2n >= count ? quotient + 1n : quotient;
}

/** Tie order helper shared by the itemised and crew-currency allocations. */
export function payerFirstOrder(
  members: readonly { readonly userId: string }[],
  payerId: string,
): number[] {
  return tieOrder(members, payerId);
}
