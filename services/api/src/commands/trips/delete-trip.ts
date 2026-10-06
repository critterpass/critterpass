/**
 * `delete_trip` (doc delta, docs/api-contracts.md §4.7): an organiser deletes a trip still being
 * set up (`won` or `setup`) that nobody else is on (a crewmate who answered OUT does not count).
 * The trip and every row that hangs off it go, in this one transaction. A trip that already holds
 * money, bookings, photos or a boost is refused (`STATE_INVALID` `has_records`): cancelling keeps
 * those readable instead.
 */
import {
  DELETABLE_TRIP_STATUSES,
  deleteTripPayloadSchema,
  DomainError,
  type DeleteTripPayload,
  type DeleteTripResult,
  type TripStatus,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { lockTripStatus, requireOrganiser } from './removal-shared';

/** Anyone else still on the trip, and whether it holds anything worth keeping. */
async function blockers(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<{ others: number; records: boolean }> {
  const { rows } = await tx.query<{ others: number; records: boolean }>(
    `SELECT (SELECT count(*)::int FROM trip_participants
              WHERE trip_id = $1 AND user_id <> $2 AND rsvp <> 'out') AS others,
            EXISTS (SELECT 1 FROM expenses WHERE trip_id = $1)
              OR EXISTS (SELECT 1 FROM bookings WHERE trip_id = $1)
              OR EXISTS (SELECT 1 FROM photos WHERE trip_id = $1)
              OR EXISTS (SELECT 1 FROM trip_boosts WHERE trip_id = $1) AS records`,
    [tripId, uid],
  );
  return rows[0] ?? { others: 0, records: false };
}

export const deleteTripCommand = defineCommand({
  name: 'delete_trip',
  v: 1,
  schema: deleteTripPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (tx, payload: DeleteTripPayload) => requireOrganiser(tx, payload.trip_id),
  handle: (tx, payload, ctx): Promise<DeleteTripResult> =>
    asSystemRole(tx, async () => {
      const tripId = payload.trip_id;
      const status = await lockTripStatus(tx, tripId);
      if (!DELETABLE_TRIP_STATUSES.has(status as TripStatus)) {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: status });
      }
      const blocked = await blockers(tx, tripId, ctx.uid);
      if (blocked.others > 0) throw new DomainError('STATE_INVALID', { reason: 'others_on_trip' });
      if (blocked.records) throw new DomainError('STATE_INVALID', { reason: 'has_records' });
      await tx.query('SAVEPOINT delete_trip');
      try {
        await tx.query("SELECT app.purge_rows('public.trips', 'id', ARRAY[$1::text])", [tripId]);
      } catch {
        // A row the walk may not remove (an append-only ledger, a guarded table) keeps the trip.
        await tx.query('ROLLBACK TO SAVEPOINT delete_trip');
        throw new DomainError('STATE_INVALID', { reason: 'has_records' });
      }
      await tx.query('RELEASE SAVEPOINT delete_trip');
      return { trip_id: tripId, deleted: true };
    }),
});
