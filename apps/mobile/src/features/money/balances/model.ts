/**
 * The Balances screen's numbers, all from the engine: each member's net from the trip's ledger
 * entries in the crew currency (they always sum to zero), the bar lengths (normalised per side, so
 * the biggest creditor and the biggest debtor each fill their half), the hero line, and the settle
 * plan whose length is "SETTLE IN n TAPS". Payments already marked paid count as made.
 */
import { balances, settlePlan, totalSpent, type OpenPayment, type Transfer } from '@cp/cost-engine';
import { OPEN_PAYMENT_STATUSES } from '@cp/domain';

import type { MoneyMember } from '../data/context';
import { minor, type ExpenseRow, type LedgerRow, type PaymentRow } from '../data/queries';

export type HeroKind = 'owed' | 'owes' | 'square';

export interface BalanceLine {
  readonly userId: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly me: boolean;
  readonly netMinor: bigint;
  /** Bar length against the largest balance on the same side, 0 to 1. */
  readonly fraction: number;
  readonly direction: 'owed' | 'owes' | 'even';
}

export interface BalancesModel {
  readonly hero: { readonly kind: HeroKind; readonly amountMinor: bigint };
  readonly lines: readonly BalanceLine[];
  readonly totalSpentMinor: bigint;
  readonly plan: readonly Transfer[];
  /** Open payments of the trip (requested, marked paid, disputed or planned). */
  readonly openPayments: number;
}

export interface BalancesInput {
  readonly uid: string;
  readonly members: readonly MoneyMember[];
  /** Members shown even at zero (the trip's split members). */
  readonly shown: readonly MoneyMember[];
  readonly ledger: readonly LedgerRow[];
  readonly payments: readonly PaymentRow[];
  readonly expenses: readonly Pick<ExpenseRow, 'crew_amount_minor' | 'crew_currency'>[];
  readonly currency: string;
}

const OPEN = new Set<string>(OPEN_PAYMENT_STATUSES);

/** Bar length as a fraction: exact integer ratio, rounded to 1/1000 for layout only. */
function ratio(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const abs = part < 0n ? -part : part;
  return Number((abs * 1000n) / whole) / 1000;
}

export function openPaymentsOf(payments: readonly PaymentRow[]): OpenPayment[] {
  return payments
    .filter((payment) => OPEN.has(payment.status))
    .map((payment) => ({
      id: payment.id,
      fromId: payment.from_id,
      toId: payment.to_id,
      amountMinor: minor(payment.amount_minor),
      status: payment.status as OpenPayment['status'],
    }));
}

/**
 * Nobody to split with: the crew has no other active member and nobody else is in the ledger. The
 * balances would only ever read "all square", so the screen shows what was spent instead.
 */
export function isSolo(
  uid: string,
  members: readonly MoneyMember[],
  lines: readonly BalanceLine[],
): boolean {
  const others = members.filter((member) => member.active && member.userId !== uid);
  return others.length === 0 && lines.every((line) => line.me);
}

export function buildBalances(input: BalancesInput): BalancesModel {
  const nets = balances(
    input.ledger.map((row) => ({
      debtorId: row.debtor_id,
      creditorId: row.creditor_id,
      amountMinor: minor(row.amount_minor),
      currency: row.currency,
    })),
    input.currency,
  );
  const ids = [...input.shown.map((member) => member.userId)];
  for (const id of nets.keys()) if (!ids.includes(id)) ids.push(id);
  if (!ids.includes(input.uid)) ids.unshift(input.uid);

  let maxOwed = 0n;
  let maxOwes = 0n;
  for (const id of ids) {
    const net = nets.get(id) ?? 0n;
    if (net > maxOwed) maxOwed = net;
    if (-net > maxOwes) maxOwes = -net;
  }
  const lines = ids.map((id): BalanceLine => {
    const member = input.members.find((candidate) => candidate.userId === id);
    const net = nets.get(id) ?? 0n;
    return {
      userId: id,
      name: member?.name ?? '',
      joinIndex: member?.joinIndex ?? 0,
      me: id === input.uid,
      netMinor: net,
      fraction: net > 0n ? ratio(net, maxOwed) : ratio(net, maxOwes),
      direction: net > 0n ? 'owed' : net < 0n ? 'owes' : 'even',
    };
  });
  // You first, then everyone else from most owed to most owing (stable by join order).
  lines.sort((a, b) => {
    if (a.me !== b.me) return a.me ? -1 : 1;
    if (a.netMinor !== b.netMinor) return a.netMinor > b.netMinor ? -1 : 1;
    return a.joinIndex - b.joinIndex;
  });

  const mine = nets.get(input.uid) ?? 0n;
  const open = openPaymentsOf(input.payments);
  const plan = settlePlan(
    ids.map((id) => ({ userId: id, netMinor: nets.get(id) ?? 0n })),
    open,
  );
  return {
    hero: {
      kind: mine > 0n ? 'owed' : mine < 0n ? 'owes' : 'square',
      amountMinor: mine < 0n ? -mine : mine,
    },
    lines,
    totalSpentMinor: totalSpent(
      input.expenses
        .filter((expense) => expense.crew_currency === input.currency)
        .map((expense) => ({ crewAmountMinor: minor(expense.crew_amount_minor) })),
    ),
    plan,
    openPayments: open.length,
  };
}
