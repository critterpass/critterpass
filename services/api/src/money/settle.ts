/**
 * Settling up on the database: a trip's balances from its ledger entries, its open payments, the
 * settle plan, the re-issue of requests a new expense made stale, and confirming a payment (its
 * ledger entry, and the Settled Tokek when it clears the trip). Writes run as the system after the
 * command's policy check.
 */
import {
  paymentEntry,
  settlePlan,
  staleRequests,
  money,
  type MemberNet,
  type OpenPayment,
  type Transfer,
} from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import { DomainError, generateUuidV7, MONEY_RT, type PaymentStatus } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { publishMoney, tripMoneyMembers } from '../commands/money/shared';
import { writeLedgerEntries } from './ledger';

export interface PaymentRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly from_id: string;
  readonly to_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly method: string | null;
  readonly last_nudged_at: Date | null;
  readonly version: number;
  readonly created_by: string;
}

const PAYMENT_COLUMNS = `id, crew_id, trip_id, from_id, to_id, amount_minor::text, currency, status,
  method, last_nudged_at, version, created_by`;

/** The payment as the caller sees it (`lock`: re-read under its row lock as the system). */
export async function loadPayment(
  tx: pg.PoolClient,
  paymentId: string,
  lock = false,
): Promise<PaymentRow> {
  const read = () =>
    tx.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [paymentId],
    );
  const { rows } = lock ? await asSystemRole(tx, read) : await read();
  const payment = rows[0];
  if (payment === undefined) throw new DomainError('NOT_FOUND', { reason: 'payment' });
  return payment;
}

/** Every member's balance within one trip, in the crew currency, in the trip's member order. */
export async function tripNets(
  tx: pg.PoolClient,
  tripId: string,
  currency: string,
): Promise<MemberNet[]> {
  const members = await tripMoneyMembers(tx, tripId);
  const { rows } = await tx.query<{ member: string; net: string }>(
    `SELECT member, sum(delta)::text AS net FROM (
       SELECT creditor_id AS member, amount_minor AS delta FROM ledger_entries
        WHERE trip_id = $1 AND currency = $2
       UNION ALL
       SELECT debtor_id, -amount_minor FROM ledger_entries WHERE trip_id = $1 AND currency = $2
     ) moves GROUP BY member`,
    [tripId, currency],
  );
  const nets = new Map(rows.map((row) => [row.member, BigInt(row.net)]));
  const order = [...members, ...[...nets.keys()].filter((id) => !members.includes(id)).sort()];
  return order.map((userId) => ({ userId, netMinor: nets.get(userId) ?? 0n }));
}

export async function openPayments(tx: pg.PoolClient, tripId: string): Promise<OpenPayment[]> {
  const { rows } = await tx.query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM payments
      WHERE trip_id = $1 AND status IN ('pending', 'requested', 'marked_paid', 'disputed')
      ORDER BY created_at, id`,
    [tripId],
  );
  return rows.map((row) => ({
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    amountMinor: BigInt(row.amount_minor),
    status: row.status as OpenPayment['status'],
  }));
}

export async function tripSettlePlan(
  tx: pg.PoolClient,
  tripId: string,
  currency: string,
): Promise<Transfer[]> {
  return settlePlan(await tripNets(tx, tripId, currency), await openPayments(tx, tripId));
}

/**
 * After a change to what the trip owes: an open request that no longer matches the plan is
 * cancelled and re-issued at the plan's amount (or withdrawn when the pair is square), each with a
 * `payment.status` hint so the settle screen shows the notice.
 */
export async function reissueStaleRequests(
  tx: pg.PoolClient,
  crewId: string,
  tripId: string,
  currency: string,
): Promise<void> {
  const open = await openPayments(tx, tripId);
  if (!open.some((p) => p.status === 'requested' || p.status === 'pending')) return;
  const plan = settlePlan(await tripNets(tx, tripId, currency), open);
  for (const change of staleRequests(plan, open)) {
    const reissued = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<PaymentRow>(
        `UPDATE payments SET status = 'cancelled', version = version + 1
          WHERE id = $1 AND status IN ('pending', 'requested') RETURNING ${PAYMENT_COLUMNS}`,
        [change.paymentId],
      );
      const old = rows[0];
      if (old === undefined || change.amountMinor === null) return null;
      const id = generateUuidV7();
      await tx.query(
        `INSERT INTO payments (id, crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
           requested_at, reissued_from_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'requested' THEN now() END, $9, $10)`,
        [
          id,
          old.crew_id,
          old.trip_id,
          old.from_id,
          old.to_id,
          change.amountMinor.toString(),
          old.currency,
          old.status === 'requested' ? 'requested' : 'pending',
          old.id,
          old.created_by,
        ],
      );
      return id;
    });
    await publishMoney(tx, crewId, MONEY_RT.paymentStatus, {
      payment_id: change.paymentId,
      status: 'cancelled',
      reissued_as: reissued,
    });
  }
}

export interface ConfirmOutcome {
  readonly version: number;
  /** Set when this confirm cleared the trip. */
  readonly settledAt: Date | null;
}

/**
 * Confirms a payment: the ledger entry that cancels the debt, the hint, the event, and the Settled
 * Tokek for every participant when the trip is now square (one `granted_at` for all of them).
 */
export async function confirmPayment(
  tx: pg.PoolClient,
  payment: PaymentRow,
  at: Date,
  actorId: string | null,
): Promise<ConfirmOutcome> {
  const auto = actorId === null;
  const granted = await asSystemRole(tx, async () => {
    await tx.query(
      `UPDATE payments SET status = 'confirmed', confirmed_at = $2, auto_confirmed = $3,
         version = version + 1 WHERE id = $1`,
      [payment.id, at, auto],
    );
    await writeLedgerEntries(tx, [
      paymentEntry({
        id: payment.id,
        crewId: payment.crew_id,
        tripId: payment.trip_id,
        fromId: payment.from_id,
        toId: payment.to_id,
        amount: money(BigInt(payment.amount_minor), payment.currency),
      }),
    ]);
    if (payment.trip_id === null) return [];
    const { rows } = await tx.query<{ granted_user: string }>(
      'SELECT granted_user FROM app.grant_settled_if_square($1, $2)',
      [payment.trip_id, at],
    );
    return rows.map((row) => row.granted_user);
  });
  const ids = {
    crew_id: payment.crew_id,
    trip_id: payment.trip_id,
    payment_id: payment.id,
    from_id: payment.from_id,
    to_id: payment.to_id,
  };
  await publishMoney(tx, payment.crew_id, MONEY_RT.paymentStatus, {
    payment_id: payment.id,
    status: 'confirmed',
  });
  await publishMoney(tx, payment.crew_id, MONEY_RT.balancesUpdated, { crew_id: payment.crew_id });
  await emitEvent(tx, {
    type: 'payment.confirmed',
    aggregateKind: 'payment',
    aggregateId: payment.id,
    actorKind: auto ? 'system' : 'user',
    actorId,
    crewId: payment.crew_id,
    tripId: payment.trip_id,
    payload: { ...ids, auto },
  });
  if (granted.length === 0 || payment.trip_id === null) {
    return { version: payment.version + 1, settledAt: null };
  }
  await publishMoney(tx, payment.crew_id, MONEY_RT.rewardGranted, {
    trip_id: payment.trip_id,
    kind: 'settled',
    server_ts: at.toISOString(),
  });
  await emitEvent(tx, {
    type: 'trip.settled',
    aggregateKind: 'trip',
    aggregateId: payment.trip_id,
    actorKind: auto ? 'system' : 'user',
    actorId,
    crewId: payment.crew_id,
    tripId: payment.trip_id,
    payload: {
      crew_id: payment.crew_id,
      trip_id: payment.trip_id,
      granted_at: at.toISOString(),
      user_ids: granted,
    },
  });
  return { version: payment.version + 1, settledAt: at };
}

/** The status change hint and event for a transition other than a confirm. */
export async function announcePayment(
  tx: pg.PoolClient,
  payment: PaymentRow,
  status: PaymentStatus,
  event: 'payment.requested' | 'payment.nudged' | 'payment.marked_paid' | 'payment.disputed',
  actorId: string,
): Promise<void> {
  await publishMoney(tx, payment.crew_id, MONEY_RT.paymentStatus, {
    payment_id: payment.id,
    status,
  });
  await emitEvent(tx, {
    type: event,
    aggregateKind: 'payment',
    aggregateId: payment.id,
    actorKind: 'user',
    actorId,
    crewId: payment.crew_id,
    tripId: payment.trip_id,
    payload: {
      crew_id: payment.crew_id,
      trip_id: payment.trip_id,
      payment_id: payment.id,
      from_id: payment.from_id,
      to_id: payment.to_id,
    },
  });
}
