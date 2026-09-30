/**
 * `set_leave_by_buffer` (doc delta, organiser): the minutes of slack before the crew leaves (10 by
 * default). The leave-by is recomputed by the worker, so the time, its timers and the crew's
 * devices all move together.
 */
import { sendInTx } from '@cp/db';
import { DomainError, setLeaveByBufferPayloadSchema, TRIP_DAY_QUEUES } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireOrganiser } from './shared';

async function leaveByTrip(
  tx: Parameters<typeof requireOrganiser>[0],
  leaveById: string,
): Promise<string> {
  const { rows } = await tx.query<{ trip_id: string }>(
    "SELECT trip_id FROM leave_bys WHERE id = $1 AND state NOT IN ('cancelled', 'departed')",
    [leaveById],
  );
  const tripId = rows[0]?.trip_id;
  if (tripId === undefined) throw new DomainError('NOT_FOUND', { reason: 'leave_by' });
  return tripId;
}

export const setLeaveByBufferCommand = defineCommand({
  name: 'set_leave_by_buffer',
  v: 1,
  schema: setLeaveByBufferPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireOrganiser(tx, await leaveByTrip(tx, payload.leave_by_id), ctx.uid);
  },
  handle: async (tx, payload) => {
    const tripId = await leaveByTrip(tx, payload.leave_by_id);
    await asSystemRole(tx, () =>
      tx.query('UPDATE leave_bys SET buffer_min = $2 WHERE id = $1', [
        payload.leave_by_id,
        payload.buffer_min,
      ]),
    );
    await sendInTx(
      tx,
      TRIP_DAY_QUEUES.leaveByRecompute,
      { trip_id: tripId },
      { singletonKey: tripId },
    );
    return { leave_by_id: payload.leave_by_id, buffer_min: payload.buffer_min };
  },
});
