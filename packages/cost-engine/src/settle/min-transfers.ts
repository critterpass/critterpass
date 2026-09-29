/**
 * Minimum transfers to settle a set of balances ("Tokek netted {n} expenses down to {m} payments").
 *
 * With k members owed or owing, the fewest transfers is k minus the largest number of disjoint
 * groups whose balances each sum to zero (each group settles in its size minus one). For up to 16
 * members (the seat cap) that partition is found exactly by a dynamic programme over subsets; each
 * group then settles greedily, the largest debt to the largest credit. Every tie breaks by the
 * members' given order, so the same balances always give the same plan. Above 16 the greedy
 * settle runs over everyone (never reached while crews seat at most 16).
 */
import { DomainError } from '@cp/domain';

export interface MemberNet {
  readonly userId: string;
  /** Positive = owed, negative = owes. */
  readonly netMinor: bigint;
}

export interface Transfer {
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: bigint;
}

export const EXACT_SETTLE_LIMIT = 16;

/** Greedy settle of one zero-sum group: largest debtor pays largest creditor, ties by position. */
function settleGroup(
  group: readonly MemberNet[],
  position: ReadonlyMap<string, number>,
): Transfer[] {
  const pos = (id: string) => position.get(id) ?? 0;
  const debtors = group
    .filter((m) => m.netMinor < 0n)
    .map((m) => ({ id: m.userId, left: -m.netMinor }));
  const creditors = group
    .filter((m) => m.netMinor > 0n)
    .map((m) => ({ id: m.userId, left: m.netMinor }));
  const byLeft = (a: { id: string; left: bigint }, b: { id: string; left: bigint }) =>
    a.left === b.left ? pos(a.id) - pos(b.id) : a.left > b.left ? -1 : 1;
  const transfers: Transfer[] = [];
  for (;;) {
    debtors.sort(byLeft);
    creditors.sort(byLeft);
    const debtor = debtors.find((d) => d.left > 0n);
    const creditor = creditors.find((c) => c.left > 0n);
    if (debtor === undefined || creditor === undefined) break;
    const amount = debtor.left < creditor.left ? debtor.left : creditor.left;
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountMinor: amount });
    debtor.left -= amount;
    creditor.left -= amount;
  }
  return transfers;
}

/** Splits the members into the largest number of zero-sum groups (members in given order). */
function zeroSumGroups(members: readonly MemberNet[]): MemberNet[][] {
  const n = members.length;
  const full = (1 << n) - 1;
  const sums = new Array<bigint>(1 << n).fill(0n);
  for (let mask = 1; mask <= full; mask += 1) {
    const low = Math.clz32(1) - Math.clz32(mask & -mask);
    sums[mask] = (sums[mask & (mask - 1)] ?? 0n) + (members[low]?.netMinor ?? 0n);
  }
  const best = new Array<number>(1 << n).fill(0);
  for (let mask = 1; mask <= full; mask += 1) {
    let top = 0;
    for (let i = 0; i < n; i += 1) {
      if ((mask & (1 << i)) !== 0) top = Math.max(top, best[mask ^ (1 << i)] ?? 0);
    }
    best[mask] = top + (sums[mask] === 0n ? 1 : 0);
  }
  // Walk back from the full set, removing the lowest member that keeps the optimum; a group closes
  // each time the remaining set sums to zero.
  const groups: MemberNet[][] = [];
  let current: MemberNet[] = [];
  let mask = full;
  while (mask !== 0) {
    const closes = sums[mask] === 0n ? 1 : 0;
    for (let i = 0; i < n; i += 1) {
      const bit = 1 << i;
      if ((mask & bit) !== 0 && (best[mask ^ bit] ?? 0) + closes === best[mask]) {
        current.push(members[i] as MemberNet);
        mask ^= bit;
        if (sums[mask] === 0n) {
          groups.push(current);
          current = [];
        }
        break;
      }
    }
  }
  return groups;
}

/** The fewest transfers that bring every balance to zero; nets must sum to zero. */
export function minTransfers(nets: readonly MemberNet[]): Transfer[] {
  const total = nets.reduce((sum, member) => sum + member.netMinor, 0n);
  if (total !== 0n) throw new DomainError('VALIDATION', { reason: 'nets_not_zero_sum' });
  const position = new Map(nets.map((member, index) => [member.userId, index]));
  const open = nets.filter((member) => member.netMinor !== 0n);
  if (open.length === 0) return [];
  if (open.length > EXACT_SETTLE_LIMIT) return settleGroup(open, position);
  return zeroSumGroups(open).flatMap((group) => settleGroup(group, position));
}
