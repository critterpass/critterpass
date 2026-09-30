/**
 * The order flow's reads (docs/api-contracts.md §5):
 *
 * - `GET /v1/suppliers/payment-session/{hold_id}`: the buyer opens Viator's hosted payment form for
 *   an open hold (3DS happens inside it; card data never reaches us). Opening it moves the order to
 *   `awaiting_payment`; an expired hold answers `HOLD_EXPIRED`.
 * - `GET /v1/suppliers/offers`: Viator products for a destination and date, verbatim and
 *   attributed, fetched per view and never cached or stored (supplier content).
 *
 * Both answer `SUPPLIER_UNAVAILABLE` while the Viator booking switch is off: the app shows links.
 */
import { withUser } from '@cp/db';
import { DomainError, generateUuidV7 } from '@cp/domain';
import { toSupplierDomainError } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import type { ActivityBookingPort } from './order-port';
import { lockOrder, moveOrder, requireViatorOn } from './order-store';

export interface OrderRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly port: ActivityBookingPort | undefined;
  /** The clock hold deadlines are judged against. */
  readonly now?: () => Date;
}

const PAYABLE = new Set(['holding', 'hold_not_provided', 'awaiting_payment', 'payment_failed']);

const offersQuery = z.object({
  trip_id: z.uuid(),
  destination_ref: z.string().regex(/^\d{1,12}$/),
  date: z.iso.date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export function registerOrderRoutes(app: OpenAPIHono<AppEnv>, deps: OrderRouteDeps): void {
  app.get('/v1/suppliers/payment-session/:holdId', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const holdId = c.req.param('holdId');
    if (!/^[0-9a-f-]{36}$/.test(holdId)) throw new DomainError('NOT_FOUND', { reason: 'order' });
    const body = await withUser(deps.pool, session.uid, generateUuidV7(), async (tx) => {
      await requireViatorOn(tx);
      const order = await lockOrder(tx, holdId);
      if (order.buyer_id !== session.uid) throw new DomainError('NOT_FOUND', { reason: 'order' });
      if (order.status === 'hold_expired') {
        throw new DomainError('HOLD_EXPIRED', { hold_id: order.id });
      }
      if (!PAYABLE.has(order.status) || order.payment_session_token === null) {
        throw new DomainError('STATE_INVALID', { state: order.status });
      }
      if (
        order.hold_valid_until !== null &&
        order.hold_valid_until <= (deps.now?.() ?? new Date())
      ) {
        throw new DomainError('HOLD_EXPIRED', { hold_id: order.id });
      }
      await moveOrder(tx, order, 'awaiting_payment');
      return {
        hold_id: order.id,
        payment_session_token: order.payment_session_token,
        hold_valid_until: order.hold_valid_until?.toISOString() ?? null,
      };
    });
    c.header('Cache-Control', 'no-store');
    return c.json(body);
  });

  app.get('/v1/suppliers/offers', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = offersQuery.parse(c.req.query());
    await withUser(deps.pool, session.uid, generateUuidV7(), async (tx) => {
      const { rows } = await tx.query<{ member: boolean }>(
        'SELECT app.is_trip_member($1) AS member',
        [query.trip_id],
      );
      if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
      await requireViatorOn(tx);
    });
    if (deps.port === undefined) throw toSupplierDomainError(new Error('no adapter'), 'viator');
    let offers;
    try {
      offers = await deps.port.search({
        destinationRef: query.destination_ref,
        date: query.date,
        currency: query.currency,
      });
    } catch (error) {
      throw toSupplierDomainError(error, 'viator');
    }
    c.header('Cache-Control', 'no-store');
    return c.json({ attribution: 'viator', offers });
  });
}
