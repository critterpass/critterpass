/**
 * `release_activity_hold` (docs/api-contracts.md §4.11): the holder lets a hold go before it lapses
 * (the guide's compensation for `hold_activity`). Viator holds lapse on their own, so nothing is
 * sent to Viator; the order ends `released`, its expiry timer is disarmed, and the hold chip and
 * "held" copy go away with it. Releasing an order that is no longer an open hold changes nothing.
 */
import { appendDomainEvent, cancelScheduledEvent } from '@cp/db';
import {
  DomainError,
  isOpenHold,
  releaseActivityHoldPayloadSchema,
  SUPPLIER_QUEUES,
  type OrderStatusResult,
} from '@cp/domain';

import { lockOrder, moveOrder } from '../../suppliers/order-store';
import { requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';

export const releaseActivityHoldCommand = defineCommand({
  name: 'release_activity_hold',
  v: 1,
  schema: releaseActivityHoldPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const order = await lockOrder(tx, payload.hold_id);
    if (order.buyer_id !== ctx.uid) throw new DomainError('NOT_FOUND', { reason: 'order' });
  },
  handle: async (tx, payload, ctx): Promise<OrderStatusResult> => {
    const order = await lockOrder(tx, payload.hold_id);
    if (!isOpenHold(order.status)) return { hold_id: order.id, status: order.status };
    const trip = await requireTripParticipant(tx, order.trip_id, ctx.uid);
    await moveOrder(tx, order, 'released', { hold_valid_until: null, next_poll_at: null });
    await cancelScheduledEvent(tx, { kind: SUPPLIER_QUEUES.holdExpiry, refId: order.id });
    await appendDomainEvent(tx, {
      type: 'activity.hold_released',
      aggregateKind: 'supplier_order',
      aggregateId: order.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { trip_id: trip.id, order_id: order.id },
    });
    return { hold_id: order.id, status: 'released' };
  },
});
