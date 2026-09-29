/**
 * `money.autoconfirm` (daily, 04:00 Singapore): a payment marked paid seven days ago that nobody
 * disputed confirms itself. Each one writes its ledger entry and, when it clears its trip, grants
 * the Settled Tokek exactly as a payee's confirm would (the same SQL grant, one `granted_at`).
 */
import { money, paymentEntry } from '@cp/cost-engine';
import { emitEvent, outbox, withSystem } from '@cp/db';
import { channelName, MONEY_QUEUES, MONEY_RT, PAYMENT_AUTOCONFIRM_DAYS } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { appendLedgerEntries } from './ledger-db';

interface DuePayment {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly from_id: string;
  readonly to_id: string;
  readonly amount_minor: string;
  readonly currency: string;
}

async function confirmOne(tx: pg.PoolClient, payment: DuePayment, now: Date): Promise<boolean> {
  await tx.query(
    `UPDATE payments SET status = 'confirmed', confirmed_at = $2, auto_confirmed = true,
       version = version + 1 WHERE id = $1`,
    [payment.id, now],
  );
  await appendLedgerEntries(tx, [
    paymentEntry({
      id: payment.id,
      crewId: payment.crew_id,
      tripId: payment.trip_id,
      fromId: payment.from_id,
      toId: payment.to_id,
      amount: money(BigInt(payment.amount_minor), payment.currency),
    }),
  ]);
  const channel = channelName('crew_money', payment.crew_id);
  await outbox(tx, channel, MONEY_RT.paymentStatus, {
    payment_id: payment.id,
    status: 'confirmed',
  });
  await outbox(tx, channel, MONEY_RT.balancesUpdated, { crew_id: payment.crew_id });
  const ids = {
    crew_id: payment.crew_id,
    trip_id: payment.trip_id,
    payment_id: payment.id,
    from_id: payment.from_id,
    to_id: payment.to_id,
  };
  await emitEvent(tx, {
    type: 'payment.confirmed',
    aggregateKind: 'payment',
    aggregateId: payment.id,
    actorKind: 'system',
    actorId: null,
    crewId: payment.crew_id,
    tripId: payment.trip_id,
    payload: { ...ids, auto: true },
  });
  if (payment.trip_id === null) return false;
  const { rows } = await tx.query<{ granted_user: string }>(
    'SELECT granted_user FROM app.grant_settled_if_square($1, $2)',
    [payment.trip_id, now],
  );
  if (rows.length === 0) return false;
  await outbox(tx, channel, MONEY_RT.rewardGranted, {
    trip_id: payment.trip_id,
    kind: 'settled',
    server_ts: now.toISOString(),
  });
  await emitEvent(tx, {
    type: 'trip.settled',
    aggregateKind: 'trip',
    aggregateId: payment.trip_id,
    actorKind: 'system',
    actorId: null,
    crewId: payment.crew_id,
    tripId: payment.trip_id,
    payload: {
      crew_id: payment.crew_id,
      trip_id: payment.trip_id,
      granted_at: now.toISOString(),
      user_ids: rows.map((row) => row.granted_user),
    },
  });
  return true;
}

export async function autoconfirmPayments(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ confirmed: number; settled: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<DuePayment>(
      `SELECT id, crew_id, trip_id, from_id, to_id, amount_minor::text, currency FROM payments
        WHERE status = 'marked_paid' AND marked_at <= $1
        ORDER BY marked_at, id FOR UPDATE SKIP LOCKED`,
      [new Date(now.getTime() - PAYMENT_AUTOCONFIRM_DAYS * 86_400_000)],
    );
    let settled = 0;
    for (const payment of rows) {
      if (await confirmOne(tx, payment, now)) settled += 1;
    }
    return { confirmed: rows.length, settled };
  });
}

export function autoconfirmJob(): JobDefinition<Record<string, never>> {
  return defineJob({
    queue: MONEY_QUEUES.autoconfirm,
    schema: z.object({}).strict(),
    handler: async (_data, ctx) => ({ ...(await autoconfirmPayments(ctx.pool)) }),
  });
}
