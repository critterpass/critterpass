/**
 * `cancel_trip` (doc delta, docs/api-contracts.md §4.7): an organiser calls off a trip that has
 * not started (setup, proposed, confirmed or pre-trip). The trip moves to `cancelled` through the
 * one status path, so its `trip.status_changed` event tells everyone on it (push `trip_cancelled`)
 * and queues the boost's move to the crew's next trip or a credit. Open polls are cancelled and an
 * unanswered proposal is closed in the same transaction; chat, money, bookings and the album stay
 * to read. Cancelling twice answers `cancelled: false`.
 */
import { moveTripStatus } from '@cp/db';
import {
  CANCELLABLE_TRIP_STATUSES,
  cancelTripPayloadSchema,
  DomainError,
  type CancelTripPayload,
  type CancelTripResult,
  type TripStatus,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { lockTripStatus, requireOrganiser } from './removal-shared';

export const cancelTripCommand = defineCommand({
  name: 'cancel_trip',
  v: 1,
  schema: cancelTripPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (tx, payload: CancelTripPayload) => requireOrganiser(tx, payload.trip_id),
  handle: (tx, payload, ctx): Promise<CancelTripResult> =>
    asSystemRole(tx, async () => {
      const tripId = payload.trip_id;
      const result = { trip_id: tripId, status: 'cancelled' as const };
      const status = await lockTripStatus(tx, tripId);
      if (status === 'cancelled') return { ...result, cancelled: false };
      if (!CANCELLABLE_TRIP_STATUSES.has(status as TripStatus)) {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: status });
      }
      const actor = { kind: 'user' as const, id: ctx.uid };
      const from = status as TripStatus;
      if (!(await moveTripStatus(tx, { tripId, from, to: 'cancelled', actor }))) {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status' });
      }
      await tx.query('UPDATE trips SET cancelled_at = $2 WHERE id = $1', [
        tripId,
        ctx.clock.serverNow,
      ]);
      await tx.query(
        "UPDATE polls SET status = 'cancelled' WHERE trip_id = $1 AND status = 'open'",
        [tripId],
      );
      await tx.query(
        `UPDATE proposals SET status = 'superseded'
          WHERE trip_id = $1 AND status IN ('building', 'sent')`,
        [tripId],
      );
      return { ...result, cancelled: true };
    }),
});
