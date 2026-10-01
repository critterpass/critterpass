/**
 * The Viator side of a storm swap, truthfully (Viator is the merchant; a crew vote cannot pay):
 * - `hold_storm_seats`: only the original booker holds the new date, through `hold_activity`
 *   itself (same product, option, start time, travellers and plan item), then pays it in Viator's
 *   own form with `book_activity`. The swap shows `awaiting_booker_payment` meanwhile.
 * - When that new booking is confirmed (`activity.booked`, in the same transaction), and only
 *   then, the old booking is quoted and cancelled with Viator. A failed cancel leaves the old one
 *   as it was (`cancel_failed`, for the desk); an expired hold or a refused payment never touches
 *   it (the worker's `seatsNotConfirmed`).
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  holdStormSeatsPayloadSchema,
  STORM_CANCEL_REASON,
  type HoldActivityResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { quoteCancellation, supplierBookingRef } from '../../suppliers/cancel-quote';
import { lockOrder, moveOrder, orderItems } from '../../suppliers/order-store';
import { createHoldActivityCommand, type OrderCommandDeps } from '../suppliers/hold-activity';
import { defineCommand } from '../_framework/define-command';
import { requireDisruption } from './shared';

type Move = Record<string, unknown> & { state?: string; old_order_id?: string; new_date?: string };
interface StormOptionRow {
  readonly id: string;
  readonly supplier_move?: Move;
}

async function swapMove(
  tx: pg.PoolClient,
  disruptionId: string,
  uid: string,
): Promise<{ trip_id: string; move: Move; options: StormOptionRow[] }> {
  const view = await requireDisruption(tx, disruptionId, uid);
  const options = view.options as StormOptionRow[];
  const move = options.find((option) => option.id === 'swap')?.supplier_move;
  if (view.kind !== 'storm' || move?.state !== 'awaiting_booker_payment') {
    throw new DomainError('STATE_INVALID', { reason: 'no_seat_move' });
  }
  return { trip_id: view.trip_id, move, options };
}

async function saveMove(
  tx: pg.PoolClient,
  disruptionId: string,
  options: readonly StormOptionRow[],
  move: Move,
  resolve: boolean,
): Promise<void> {
  const next = options.map((option) =>
    option.id === 'swap' ? { ...option, supplier_move: move } : option,
  );
  await asSystemRole(tx, () =>
    tx.query(
      `UPDATE disruptions SET options = $2, version = version + 1,
              status = CASE WHEN $3 THEN 'resolved' ELSE status END,
              resolved_at = CASE WHEN $3 THEN now() ELSE resolved_at END
        WHERE id = $1`,
      [disruptionId, JSON.stringify(next), resolve],
    ),
  );
}

export function createHoldStormSeatsCommand(deps: OrderCommandDeps) {
  const hold = createHoldActivityCommand(deps);
  return defineCommand({
    name: 'hold_storm_seats',
    v: 1,
    schema: holdStormSeatsPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      const { move } = await swapMove(tx, payload.disruption_id, ctx.uid);
      const old = await lockOrder(tx, String(move.old_order_id));
      if (old.buyer_id !== ctx.uid)
        throw new DomainError('FORBIDDEN', { reason: 'not_the_booker' });
    },
    entitle: (tx, payload, ctx) => hold.entitle(tx, payload as never, ctx),
    handle: async (tx, payload, ctx): Promise<HoldActivityResult> => {
      const { trip_id, move, options } = await swapMove(tx, payload.disruption_id, ctx.uid);
      const old = await lockOrder(tx, String(move.old_order_id));
      const [item] = await orderItems(tx, old.id);
      if (item === undefined || old.currency === null) {
        throw new DomainError('STATE_INVALID', { reason: 'order_items' });
      }
      const option = await asSystemRole(tx, () =>
        tx.query<{ code: string | null }>(
          'SELECT product_option_code AS code FROM supplier_order_items WHERE id = $1',
          [item.id],
        ),
      );
      const optionCode = option.rows[0]?.code ?? null;
      const result = await hold.handle(
        tx,
        {
          hold_id: payload.hold_id,
          trip_id,
          offer_ref: item.product_code,
          ...(optionCode === null ? {} : { option_code: optionCode }),
          date: String(move.new_date),
          ...(item.start_time === null ? {} : { time: item.start_time.slice(0, 5) }),
          pax: [{ age_band: 'ADULT', count: item.traveller_count }],
          participant_ids: item.participant_ids,
          ...(old.stable_id === null ? {} : { stable_id: old.stable_id }),
          currency: old.currency,
        },
        ctx,
      );
      await saveMove(
        tx,
        payload.disruption_id,
        options,
        { ...move, new_order_id: payload.hold_id },
        false,
      );
      return result;
    },
  });
}

/**
 * On a confirmed booking: if it is a storm swap's new booking, cancel the old one now, and only
 * now. Runs in the confirming transaction; a failed cancel is rolled back to a savepoint so the
 * confirmation stands and the old booking stays as it was.
 */
export function stormBookedHook(deps: OrderCommandDeps) {
  return async (
    tx: pg.PoolClient,
    event: { readonly id: string; readonly type: string; readonly tripId: string | null },
  ): Promise<void> => {
    if (event.type !== 'activity.booked' || event.tripId === null) return;
    await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ payload: { order_id?: string } }>(
        'SELECT payload FROM app.domain_event_for_routing($1)',
        [event.id],
      );
      const newOrderId = rows[0]?.payload.order_id;
      if (newOrderId === undefined) return;
      const storms = await tx.query<{ id: string; options: StormOptionRow[]; crew_id: string }>(
        `SELECT d.id, d.options, t.crew_id FROM disruptions d JOIN trips t ON t.id = d.trip_id
          WHERE d.trip_id = $1 AND d.kind = 'storm' AND d.status = 'open'
            AND d.options @> jsonb_build_array(jsonb_build_object(
                  'supplier_move', jsonb_build_object('new_order_id', $2::text)))
          FOR UPDATE OF d`,
        [event.tripId, newOrderId],
      );
      for (const storm of storms.rows) {
        const move = storm.options.find((option) => option.id === 'swap')?.supplier_move ?? {};
        const state = await cancelOld(
          tx,
          deps,
          String(move.old_order_id),
          event.tripId ?? '',
          storm.crew_id,
        );
        await saveMove(tx, storm.id, storm.options, { ...move, state }, true);
      }
    });
  };
}

async function cancelOld(
  tx: pg.PoolClient,
  deps: OrderCommandDeps,
  orderId: string,
  tripId: string,
  crewId: string,
): Promise<'moved' | 'cancel_failed'> {
  await tx.query('SAVEPOINT storm_cancel');
  try {
    const order = await lockOrder(tx, orderId);
    const now = deps.now?.() ?? new Date();
    const quote = await quoteCancellation(tx, deps.port, order, now);
    if (!quote.cancellable || deps.port === undefined) throw new Error('not cancellable');
    const ref = await supplierBookingRef(tx, order);
    await moveOrder(tx, order, 'cancel_requested');
    const answer = await deps.port.cancel(ref, STORM_CANCEL_REASON);
    if (answer.status !== 'cancelled') throw new Error(answer.reason ?? 'declined');
    await moveOrder(tx, { ...order, status: 'cancel_requested' }, 'cancelled');
    if (order.voucher_booking_id !== null) {
      await tx.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [
        order.voucher_booking_id,
      ]);
    }
    await appendDomainEvent(tx, {
      type: 'activity.cancelled',
      aggregateKind: 'supplier_order',
      aggregateId: order.id,
      actorKind: 'system',
      actorId: null,
      crewId,
      tripId,
      payload: { trip_id: tripId, order_id: order.id, refunded: quote.refund_percentage === 100 },
    });
    await tx.query('RELEASE SAVEPOINT storm_cancel');
    return 'moved';
  } catch {
    await tx.query('ROLLBACK TO SAVEPOINT storm_cancel');
    return 'cancel_failed';
  }
}
