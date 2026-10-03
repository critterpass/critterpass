/**
 * `retry_recap {trip_id}` (doc delta): a traveller asks for a recap again after its build failed,
 * or when a trip that has ended still has none. The build is queued on the trip's own key, so a
 * retry while one is waiting folds into it.
 */
import { sendInTx } from '@cp/db';
import {
  DomainError,
  recapBuildSingletonKey,
  RECAP_QUEUES,
  retryRecapPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function retryable(tx: pg.PoolClient, tripId: string, uid: string): Promise<void> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ status: string; recap: string | null; traveller: boolean }>(
      `SELECT t.status, r.status AS recap,
              EXISTS (
                SELECT 1 FROM trip_participants p
                 WHERE p.trip_id = t.id AND p.user_id = $2 AND p.rsvp = 'in'
                UNION ALL
                SELECT 1 FROM trip_dropouts o WHERE o.trip_id = t.id AND o.user_id = $2
              ) AS traveller
         FROM trips t LEFT JOIN recaps r ON r.trip_id = t.id
        WHERE t.id = $1`,
      [tripId, uid],
    ),
  );
  const trip = rows[0];
  if (trip === undefined || !trip.traveller) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (trip.status !== 'post_trip' && trip.status !== 'archived') {
    throw new DomainError('STATE_INVALID', { reason: 'trip_not_ended' });
  }
  if (trip.recap !== null && trip.recap !== 'failed') {
    throw new DomainError('STATE_INVALID', { reason: 'recap_not_failed' });
  }
}

export const retryRecapCommand = defineCommand({
  name: 'retry_recap',
  v: 1,
  schema: retryRecapPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await retryable(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload) =>
    asSystemRole(tx, async () => {
      await tx.query(
        "UPDATE recaps SET status = 'queued', failure_reason = NULL WHERE trip_id = $1",
        [payload.trip_id],
      );
      await sendInTx(
        tx,
        RECAP_QUEUES.build,
        { trip_id: payload.trip_id, reason: 'retry' },
        { singletonKey: recapBuildSingletonKey(payload.trip_id) },
      );
      return { trip_id: payload.trip_id, queued: true };
    }),
});
