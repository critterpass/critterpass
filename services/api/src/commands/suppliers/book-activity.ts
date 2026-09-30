/**
 * `book_activity` (docs/api-contracts.md §4.11): the buyer books a held activity with the token
 * Viator's own payment form returned (3DS happens there; we never see card data). The order moves
 * to `booking` and Viator's answer settles it: confirmed lands in the wallet with its expense,
 * pending shows "Waiting for the operator" until the status poll settles it, refused ends the
 * order. A booking already placed is never placed again, whatever op id it is replayed under. If
 * Viator's answer is lost (timeout, outage) after the request left, the order stays `booking` and
 * the status poll finds out what happened; the traveller is never charged twice.
 */
import { DomainError, bookActivityPayloadSchema, type BookActivityResult } from '@cp/domain';
import { toSupplierDomainError, type BookResult } from '@cp/suppliers';

import { settleOrder } from '../../suppliers/order-settle';
import { lockOrder, moveOrder, orderItems, requireViatorOn } from '../../suppliers/order-store';
import { requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';
import type { OrderCommandDeps } from './hold-activity';

const PLACED = new Set([
  'booking',
  'pending_operator',
  'confirmed',
  'cancel_requested',
  'cancelled',
]);
const OPEN = new Set(['holding', 'hold_not_provided', 'awaiting_payment', 'payment_failed']);

export function createBookActivityCommand(deps: OrderCommandDeps) {
  return defineCommand({
    name: 'book_activity',
    v: 1,
    schema: bookActivityPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      const order = await lockOrder(tx, payload.hold_id);
      if (order.buyer_id !== ctx.uid) throw new DomainError('NOT_FOUND', { reason: 'order' });
      await requireTripParticipant(tx, order.trip_id, ctx.uid);
    },
    entitle: async (tx) => {
      await requireViatorOn(tx);
    },
    handle: async (tx, payload, ctx): Promise<BookActivityResult> => {
      const order = await lockOrder(tx, payload.hold_id);
      if (PLACED.has(order.status)) {
        return {
          hold_id: order.id,
          status: order.status,
          booking_id: order.voucher_booking_id,
          expense_id: null,
        };
      }
      if (!OPEN.has(order.status)) {
        throw order.status === 'hold_expired'
          ? new DomainError('HOLD_EXPIRED', { hold_id: order.id })
          : new DomainError('STATE_INVALID', { state: order.status });
      }
      const now = deps.now?.() ?? ctx.clock.serverNow;
      if (order.hold_valid_until !== null && order.hold_valid_until <= now) {
        throw new DomainError('HOLD_EXPIRED', { hold_id: order.id });
      }
      if (deps.port === undefined || order.cart_ref === null) {
        throw toSupplierDomainError(new Error('no adapter'), 'viator');
      }
      const trip = await requireTripParticipant(tx, order.trip_id, ctx.uid);
      const items = await orderItems(tx, order.id);
      await moveOrder(tx, order, 'booking', { next_poll_at: now });
      const booking = { ...order, status: 'booking' as const };
      const traveller = payload.traveller_details;
      let answer: BookResult;
      try {
        answer = await deps.port.book({
          holdRef: order.cart_ref,
          paymentToken: payload.payment_session_ref,
          booker: { firstName: traveller.first_name, lastName: traveller.last_name },
          communication: {
            phone: traveller.phone,
            ...(traveller.email === undefined ? {} : { email: traveller.email }),
          },
          items: items.map((item) => ({
            bookingRef: item.supplier_booking_ref ?? item.item_ref,
            answers: (payload.answers ?? []).map((a) => ({
              question: a.question,
              answer: a.answer,
              ...(a.unit === undefined ? {} : { unit: a.unit }),
              ...(a.traveler_num === undefined ? {} : { travelerNum: a.traveler_num }),
            })),
          })),
        });
      } catch (error) {
        const mapped = toSupplierDomainError(error, 'viator');
        // A refusal before anything was placed ends here; a lost answer waits for the poll.
        if (mapped.code === 'SUPPLIER_REJECTED') throw mapped;
        return { hold_id: order.id, status: 'booking', booking_id: null, expense_id: null };
      }
      const item = answer.items[0];
      const settled = await settleOrder(
        tx,
        trip,
        booking,
        items,
        {
          outcome: answer.status,
          title: payload.title,
          voucher: answer.voucher ?? null,
          rejectionCode: item?.rejectionCode ?? null,
          nextPollHint: null,
        },
        now,
      );
      return {
        hold_id: order.id,
        status: settled.status,
        booking_id: settled.bookingId,
        expense_id: settled.expenseId,
      };
    },
  });
}
