/**
 * Settle up: the trip's payments and the engine's plan as one list of rows, each with what the
 * viewer may do. Planned transfers nobody has requested yet show as PENDING; a request, a mark and
 * a confirm move them along the payment state machine; confirmed ones stay (PAID ✓). The Settled
 * Tokek progress counts what is still open.
 */
/* eslint-disable lingui/no-unlocalized-strings -- statuses and action names are wire values. */
import type { Transfer } from '@cp/cost-engine';
import { nextPaymentStatus, type PaymentStatus } from '@cp/domain';

import { minor, type PaymentRow } from '../data/queries';

export type RowStatus = 'plan' | Exclude<PaymentStatus, 'cancelled'>;

export type RowAction = 'request' | 'nudge' | 'confirm' | 'dispute' | 'pay';

export interface SettleRowModel {
  /** The payment id, or `plan:{from}:{to}` for a planned transfer with no payment yet. */
  readonly key: string;
  readonly paymentId: string | null;
  readonly fromId: string;
  readonly toId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly status: RowStatus;
  readonly role: 'payer' | 'payee' | 'other';
  readonly actions: readonly RowAction[];
  readonly version: number | null;
  readonly note: string | null;
}

/** A nudge goes at most once a day to the same person. */
export const NUDGE_EVERY_MS = 24 * 60 * 60 * 1000;

export function planKey(fromId: string, toId: string): string {
  return `plan:${fromId}:${toId}`;
}

export function actionsFor(
  status: RowStatus,
  role: SettleRowModel['role'],
  lastNudgedAt: string | null,
  now: Date,
): RowAction[] {
  if (role === 'other' || status === 'confirmed') return [];
  if (role === 'payer') return status === 'marked_paid' ? [] : ['pay'];
  if (status === 'plan') return ['request'];
  const actions: RowAction[] = [];
  const nudgeable =
    lastNudgedAt === null || now.getTime() - Date.parse(lastNudgedAt) >= NUDGE_EVERY_MS;
  if (nextPaymentStatus(status, 'nudge') !== null && nudgeable) actions.push('nudge');
  if (nextPaymentStatus(status, 'confirm') !== null) actions.push('confirm');
  if (nextPaymentStatus(status, 'dispute') !== null) actions.push('dispute');
  return actions;
}

function roleOf(uid: string, fromId: string, toId: string): SettleRowModel['role'] {
  return uid === fromId ? 'payer' : uid === toId ? 'payee' : 'other';
}

export function settleRows(input: {
  readonly uid: string;
  readonly payments: readonly PaymentRow[];
  readonly plan: readonly Transfer[];
  readonly currency: string;
  readonly now: Date;
}): SettleRowModel[] {
  const live = input.payments.filter((payment) => payment.status !== 'cancelled');
  const open = live.filter((payment) => payment.status !== 'confirmed');
  const rows: SettleRowModel[] = live.map((payment) => {
    const status = payment.status as RowStatus;
    const role = roleOf(input.uid, payment.from_id, payment.to_id);
    return {
      key: payment.id,
      paymentId: payment.id,
      fromId: payment.from_id,
      toId: payment.to_id,
      amountMinor: minor(payment.amount_minor),
      currency: payment.currency,
      status,
      role,
      actions: actionsFor(status, role, payment.last_nudged_at, input.now),
      version: payment.version,
      note: payment.dispute_note,
    };
  });
  for (const transfer of input.plan) {
    const covered = open.some(
      (payment) => payment.from_id === transfer.fromId && payment.to_id === transfer.toId,
    );
    if (covered) continue;
    const role = roleOf(input.uid, transfer.fromId, transfer.toId);
    rows.push({
      key: planKey(transfer.fromId, transfer.toId),
      paymentId: null,
      fromId: transfer.fromId,
      toId: transfer.toId,
      amountMinor: transfer.amountMinor,
      currency: input.currency,
      status: 'plan',
      role,
      actions: actionsFor('plan', role, null, input.now),
      version: null,
      note: null,
    });
  }
  // What still needs doing first (yours before others'), paid rows last.
  const rank = (row: SettleRowModel) =>
    (row.status === 'confirmed' ? 2 : 0) + (row.role === 'other' ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b));
}

/** Rows still open: the payments left before everyone gets the Settled Tokek. */
export function openCount(rows: readonly SettleRowModel[]): number {
  return rows.filter((row) => row.status !== 'confirmed').length;
}

/** REMIND EVERYONE: the viewer is owed on at least one open row. */
export function canRemind(rows: readonly SettleRowModel[]): boolean {
  return rows.some((row) => row.role === 'payee' && row.status !== 'confirmed');
}
