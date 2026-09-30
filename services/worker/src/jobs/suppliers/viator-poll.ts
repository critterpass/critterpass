/**
 * `supplier.viator_poll` (every 3 minutes): Viator orders waiting on the operator, or whose booking
 * answer was lost, whose next poll is due are handed one by one to the api's settle door, which
 * reads Viator's status and settles the order (the api owns the Viator client, the wallet and the
 * money writers). One failing order never stops the rest; it is simply due again next run.
 */
import { withSystem } from '@cp/db';
import { SUPPLIER_INTERNAL_SECRET_HEADER, SUPPLIER_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

/** Orders settled per run; the rest are due again in 3 minutes. */
const BATCH = 50;

export interface SettleDoor {
  settle(orderId: string): Promise<void>;
}

export function createSettleDoor(options: {
  readonly baseUrl: string;
  readonly secret: string;
  readonly fetch?: typeof fetch;
}): SettleDoor {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.baseUrl.replace(/\/+$/u, '')}/internal/suppliers/settle`;
  return {
    async settle(orderId) {
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SUPPLIER_INTERNAL_SECRET_HEADER]: options.secret,
        },
        body: JSON.stringify({ order_id: orderId }),
        signal: AbortSignal.timeout(130_000),
      });
      if (!response.ok) throw new Error(`settle door answered ${response.status}`);
    },
  };
}

export async function dueOrders(pool: pg.Pool, now: Date): Promise<string[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM supplier_orders
        WHERE supplier = 'viator' AND status IN ('booking', 'pending_operator')
          AND (next_poll_at IS NULL OR next_poll_at <= $1)
        ORDER BY next_poll_at NULLS FIRST, id
        LIMIT $2`,
      [now, BATCH],
    );
    return rows.map((row) => row.id);
  });
}

export async function pollViatorOrders(
  pool: pg.Pool,
  door: SettleDoor,
  now: Date = new Date(),
): Promise<{ readonly settled: number; readonly failed: number }> {
  let settled = 0;
  let failed = 0;
  for (const id of await dueOrders(pool, now)) {
    try {
      await door.settle(id);
      settled += 1;
    } catch {
      failed += 1;
    }
  }
  return { settled, failed };
}

export function viatorPollJob(door: SettleDoor): JobDefinition<Record<string, unknown>> {
  return defineJob({
    queue: SUPPLIER_QUEUES.viatorPoll,
    schema: z.object({}).passthrough(),
    handler: async (_data, ctx) => ({ ...(await pollViatorOrders(ctx.pool, door)) }),
  });
}
