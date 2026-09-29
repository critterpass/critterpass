/**
 * The settle plan for a trip: the minimum transfers for what is still owed once payments already
 * marked paid are counted as made (they reach the ledger when confirmed). Open requests are checked
 * against the new plan: one that still matches a transfer stays; one that no longer matches is
 * re-issued at the plan's amount, or withdrawn when the pair no longer owes anything.
 */
import { minTransfers, type MemberNet, type Transfer } from './min-transfers';

export interface OpenPayment {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: bigint;
  readonly status: 'pending' | 'requested' | 'marked_paid' | 'disputed';
}

/** Nets with every marked-paid payment applied, as if already confirmed. */
function afterMarkedPaid(nets: readonly MemberNet[], open: readonly OpenPayment[]): MemberNet[] {
  const moved = new Map<string, bigint>();
  for (const payment of open.filter((p) => p.status === 'marked_paid')) {
    moved.set(payment.fromId, (moved.get(payment.fromId) ?? 0n) + payment.amountMinor);
    moved.set(payment.toId, (moved.get(payment.toId) ?? 0n) - payment.amountMinor);
  }
  return nets.map((member) => ({
    userId: member.userId,
    netMinor: member.netMinor + (moved.get(member.userId) ?? 0n),
  }));
}

export function settlePlan(nets: readonly MemberNet[], open: readonly OpenPayment[]): Transfer[] {
  return minTransfers(afterMarkedPaid(nets, open));
}

export interface RequestChange {
  readonly paymentId: string;
  /** The plan's amount for the pair, or `null` when the pair no longer owes anything. */
  readonly amountMinor: bigint | null;
}

/** Open requests (and planned rows) whose amount no longer matches the plan. */
export function staleRequests(
  plan: readonly Transfer[],
  open: readonly OpenPayment[],
): RequestChange[] {
  return open
    .filter((payment) => payment.status === 'requested' || payment.status === 'pending')
    .flatMap((payment) => {
      const transfer = plan.find((t) => t.fromId === payment.fromId && t.toId === payment.toId);
      if (transfer?.amountMinor === payment.amountMinor) return [];
      return [{ paymentId: payment.id, amountMinor: transfer?.amountMinor ?? null }];
    });
}
