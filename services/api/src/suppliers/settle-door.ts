/**
 * `POST /internal/suppliers/settle` (the worker's `supplier.viator_poll` calls it): reads Viator's
 * status for one order still waiting on the operator (or whose booking answer was lost) and settles
 * it: confirmed lands in the wallet with its expense, refused ends it, still pending waits for the
 * next poll (never sooner than Viator's 3-minute cadence). The api owns the Viator client and the
 * wallet and money writers, so the worker only schedules. Private network only, shared secret
 * compared in constant time.
 */
import { timingSafeEqual } from 'node:crypto';

import { withSystem } from '@cp/db';
import { DomainError, SUPPLIER_INTERNAL_SECRET_HEADER } from '@cp/domain';
import { toSupplierDomainError } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { loadMoneyTrip } from '../commands/money/shared';
import type { ActivityBookingPort } from './order-port';
import { answerFrom, settleOrder, type Settled } from './order-settle';
import { lockOrder, orderItems } from './order-store';

const WAITING = new Set(['booking', 'pending_operator']);

export async function settleFromSupplier(
  pool: pg.Pool,
  port: ActivityBookingPort,
  orderId: string,
  now: Date = new Date(),
): Promise<Settled | null> {
  return withSystem(pool, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!WAITING.has(order.status)) return null;
    const items = await orderItems(tx, order.id);
    const ref = items[0]?.supplier_booking_ref;
    if (ref === null || ref === undefined) {
      throw new DomainError('STATE_INVALID', { state: order.status });
    }
    let status;
    try {
      status = await port.status(ref);
    } catch (error) {
      throw toSupplierDomainError(error, 'viator');
    }
    const trip = await loadMoneyTrip(tx, order.trip_id);
    return settleOrder(tx, trip, order, items, answerFrom(status), now);
  });
}

function secretMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bodySchema = z.object({ order_id: z.uuid() });

export function registerSettleDoor(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly port: ActivityBookingPort; readonly secret: string },
): void {
  app.post('/internal/suppliers/settle', async (c) => {
    if (!secretMatches(deps.secret, c.req.header(SUPPLIER_INTERNAL_SECRET_HEADER))) {
      throw new DomainError('AUTH_REQUIRED');
    }
    const body = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new DomainError('VALIDATION', { reason: 'body' });
    const settled = await settleFromSupplier(deps.pool, deps.port, body.data.order_id);
    return c.json({ result: settled === null ? null : { status: settled.status } });
  });
}
