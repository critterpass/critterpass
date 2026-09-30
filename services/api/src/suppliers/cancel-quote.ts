/**
 * The cancellation quote shown before `cancel_activity_booking` (docs/api-contracts.md §5
 * `GET /v1/suppliers/bookings/{id}/cancel-quote`): Viator's refund for a confirmed booking right
 * now, kept on the order so the cancel command can prove the traveller saw it. Only the buyer or
 * one of the trip's organisers may ask; the answer is never cached.
 */
import { withUser } from '@cp/db';
import { DomainError, generateUuidV7, type ActivityCancelQuote } from '@cp/domain';
import { toSupplierDomainError } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { isTripOrganiser } from '../commands/money/shared';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import type { ActivityBookingPort } from './order-port';
import { lockOrder, moveOrder, orderItems, toMinor, type OrderRow } from './order-store';

/** The buyer or an organiser of the order's trip; anyone else sees `NOT_FOUND`. */
export async function requireOrderManager(
  tx: pg.PoolClient,
  order: OrderRow,
  uid: string,
): Promise<void> {
  if (order.buyer_id === uid) return;
  if (await isTripOrganiser(tx, order.trip_id)) return;
  throw new DomainError('NOT_FOUND', { reason: 'order' });
}

/** The supplier's booking reference of the order's (first) item. */
export async function supplierBookingRef(tx: pg.PoolClient, order: OrderRow): Promise<string> {
  const ref = (await orderItems(tx, order.id))[0]?.supplier_booking_ref;
  if (ref === null || ref === undefined)
    throw new DomainError('STATE_INVALID', { state: order.status });
  return ref;
}

export async function quoteCancellation(
  tx: pg.PoolClient,
  port: ActivityBookingPort | undefined,
  order: OrderRow,
  now: Date,
): Promise<ActivityCancelQuote> {
  if (order.status !== 'confirmed') throw new DomainError('STATE_INVALID', { state: order.status });
  if (port === undefined) throw toSupplierDomainError(new Error('no adapter'), 'viator');
  let quote;
  try {
    quote = await port.cancelQuote(await supplierBookingRef(tx, order));
  } catch (error) {
    throw toSupplierDomainError(error, 'viator');
  }
  const result: ActivityCancelQuote = {
    cancellable: quote.cancellable,
    refund:
      quote.refund === null
        ? null
        : {
            amount_minor: Number(toMinor(quote.refund.amount, quote.refund.currency)),
            currency: quote.refund.currency,
          },
    refund_percentage: quote.refundPercentage,
    quoted_at: now.toISOString(),
  };
  await moveOrder(tx, order, order.status, { cancel_quote: JSON.stringify(result) });
  return result;
}

export function registerCancelQuoteRoute(
  app: OpenAPIHono<AppEnv>,
  deps: {
    readonly pool: pg.Pool;
    readonly sessions: SessionResolver;
    readonly port: ActivityBookingPort | undefined;
  },
): void {
  app.get('/v1/suppliers/bookings/:id/cancel-quote', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new DomainError('NOT_FOUND', { reason: 'order' });
    const quote = await withUser(deps.pool, session.uid, generateUuidV7(), async (tx) => {
      const order = await lockOrder(tx, id);
      await requireOrderManager(tx, order, session.uid);
      return quoteCancellation(tx, deps.port, order, new Date());
    });
    c.header('Cache-Control', 'no-store');
    return c.json(quote);
  });
}
