/**
 * `cancel_activity_booking` (docs/api-contracts.md §4.11): the buyer or an organiser cancels a
 * confirmed Viator booking after seeing its refund quote (the quote route keeps it on the order;
 * without one the command refuses). Viator accepting it cancels the wallet entry and answers
 * "Cancelled · full refund" only when the quote refunded everything; Viator declining it keeps the
 * booking and says why (`SUPPLIER_REJECTED`).
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  cancelActivityBookingPayloadSchema,
  cancelQuoteSchema,
  type OrderStatusResult,
} from '@cp/domain';
import { supplierRejected, toSupplierDomainError } from '@cp/suppliers';

import { asSystemRole } from '../../admin/command';
import { requireOrderManager, supplierBookingRef } from '../../suppliers/cancel-quote';
import { lockOrder, moveOrder, requireViatorOn } from '../../suppliers/order-store';
import { requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';
import type { OrderCommandDeps } from './hold-activity';

export function createCancelActivityBookingCommand(deps: OrderCommandDeps) {
  return defineCommand({
    name: 'cancel_activity_booking',
    v: 1,
    schema: cancelActivityBookingPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      const order = await lockOrder(tx, payload.booking_id);
      await requireTripParticipant(tx, order.trip_id, ctx.uid);
      await requireOrderManager(tx, order, ctx.uid);
    },
    entitle: async (tx) => {
      await requireViatorOn(tx);
    },
    handle: async (tx, payload, ctx): Promise<OrderStatusResult & { refunded: boolean }> => {
      const order = await lockOrder(tx, payload.booking_id);
      if (order.status === 'cancelled') {
        return { hold_id: order.id, status: 'cancelled', refunded: false };
      }
      if (order.status !== 'confirmed') {
        throw new DomainError('STATE_INVALID', { state: order.status });
      }
      const quote = cancelQuoteSchema.safeParse(order.cancel_quote);
      if (!quote.success) throw new DomainError('STATE_INVALID', { reason: 'quote_first' });
      if (!quote.data.cancellable) throw supplierRejected('viator', 'NOT_CANCELLABLE');
      if (deps.port === undefined) throw toSupplierDomainError(new Error('no adapter'), 'viator');
      const ref = await supplierBookingRef(tx, order);
      await moveOrder(tx, order, 'cancel_requested');
      let answer;
      try {
        answer = await deps.port.cancel(ref, payload.reason_code);
      } catch (error) {
        throw toSupplierDomainError(error, 'viator');
      }
      if (answer.status !== 'cancelled') {
        throw supplierRejected('viator', answer.reason ?? 'DECLINED');
      }
      await moveOrder(tx, { ...order, status: 'cancel_requested' }, 'cancelled');
      if (order.voucher_booking_id !== null) {
        await asSystemRole(tx, () =>
          tx.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [
            order.voucher_booking_id,
          ]),
        );
      }
      const refunded = quote.data.refund_percentage === 100;
      const trip = await requireTripParticipant(tx, order.trip_id, ctx.uid);
      await appendDomainEvent(tx, {
        type: 'activity.cancelled',
        aggregateKind: 'supplier_order',
        aggregateId: order.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, order_id: order.id, refunded },
      });
      return { hold_id: order.id, status: 'cancelled', refunded };
    },
  });
}
