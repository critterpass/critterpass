/**
 * `supplier.hold_expiry` (docs/api-contracts-async.md §2.2): the `scheduled_events` timer armed
 * just before a kept hold's supplier deadline. Under the order's row lock an open hold ends
 * `hold_expired` ("The hold ran out — check again"), the holder hears it, and every vote still open
 * on the held plan item closes (the plan is kept: a lapsed hold cannot be honoured). A replayed
 * timer, a released or booked order changes nothing.
 */
import {
  appendDomainEvent,
  outbox,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import {
  channelName,
  isOpenHold,
  PLAN_RT,
  SUPPLIER_QUEUES,
  type SupplierOrderStatus,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { closeVoteAsKept } from '../plan/stale-sweep';

export type HoldExpiryOutcome = 'expired' | 'gone';

interface HeldOrder {
  trip_id: string;
  crew_id: string;
  buyer_id: string;
  stable_id: string | null;
  status: SupplierOrderStatus;
}

/** Closes every open vote on `stableId`'s change sets as kept; returns how many closed. */
async function closeLinkedVotes(tx: pg.PoolClient, order: HeldOrder, now: Date): Promise<number> {
  if (order.stable_id === null) return 0;
  const { rows } = await tx.query<{ id: string; poll_id: string | null }>(
    `SELECT id, poll_id FROM change_sets
      WHERE trip_id = $1 AND status = 'voting'
        AND ops @> jsonb_build_array(jsonb_build_object('target', $2::text))
      FOR UPDATE`,
    [order.trip_id, order.stable_id],
  );
  for (const row of rows) {
    await closeVoteAsKept(tx, row.poll_id, 'deadline', now);
    await tx.query("UPDATE change_sets SET status = 'rejected' WHERE id = $1", [row.id]);
    await appendDomainEvent(tx, {
      type: 'change_set.expired',
      aggregateKind: 'change_set',
      aggregateId: row.id,
      actorKind: 'system',
      actorId: null,
      payload: { trip_id: order.trip_id, change_set_id: row.id },
      crewId: order.crew_id,
      tripId: order.trip_id,
    });
    await outbox(tx, channelName('trip_plan', order.trip_id), PLAN_RT.changesetExpired, {
      change_set_id: row.id,
    });
  }
  return rows.length;
}

export async function expireHold(
  pool: pg.Pool,
  orderId: string,
  now: Date = new Date(),
): Promise<HoldExpiryOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<HeldOrder>(
      `SELECT o.trip_id, t.crew_id, o.buyer_id, o.stable_id, o.status
         FROM supplier_orders o JOIN trips t ON t.id = o.trip_id
        WHERE o.id = $1 FOR UPDATE OF o`,
      [orderId],
    );
    const order = rows[0];
    if (order === undefined || !isOpenHold(order.status)) return 'gone';
    await tx.query(
      "UPDATE supplier_orders SET status = 'hold_expired', version = version + 1 WHERE id = $1",
      [orderId],
    );
    const event = { trip_id: order.trip_id, order_id: orderId };
    const common = {
      aggregateKind: 'supplier_order',
      aggregateId: orderId,
      actorKind: 'system' as const,
      actorId: null,
      crewId: order.crew_id,
      tripId: order.trip_id,
    };
    await appendDomainEvent(tx, {
      ...common,
      type: 'hold.expiring',
      payload: { ...event, buyer_id: order.buyer_id },
    });
    await appendDomainEvent(tx, { ...common, type: 'activity.hold_expired', payload: event });
    await closeLinkedVotes(tx, order, now);
    return 'expired';
  });
}

export function holdExpiryJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: SUPPLIER_QUEUES.holdExpiry,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await expireHold(ctx.pool, data.ref_id) }),
  });
}
