/**
 * `snooze_leave_by`: the alarm's snooze (once by default). Past the limit — the second snooze —
 * the members already up get one crew knock ("Alex might need a knock."); the server decides, so
 * a device that loses count cannot knock twice.
 */
import { appendDomainEvent } from '@cp/db';
import { snoozeLeaveByPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { knockIfDue, requireLeaveByMember } from './shared';

export const snoozeLeaveByCommand = defineCommand({
  name: 'snooze_leave_by',
  v: 1,
  schema: snoozeLeaveByPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'readiness',
  authorize: async (tx, payload, ctx) => {
    await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const leaveBy = await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ snooze_count: number }>(
        `INSERT INTO readiness (leave_by_id, trip_id, user_id, snooze_count)
         VALUES ($1, $2, $3, greatest(1, $4::int))
         ON CONFLICT (leave_by_id, user_id) DO UPDATE
           SET snooze_count = greatest(readiness.snooze_count + 1, $4::int)
         RETURNING snooze_count`,
        [leaveBy.id, leaveBy.trip_id, ctx.uid, payload.count ?? 1],
      );
      const count = rows[0]?.snooze_count ?? 1;
      await appendDomainEvent(tx, {
        type: 'leave_by.snoozed',
        aggregateKind: 'leave_by',
        aggregateId: leaveBy.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: leaveBy.trip_id,
        payload: { trip_id: leaveBy.trip_id, leave_by_id: leaveBy.id, user_id: ctx.uid, count },
      });
      const knocked = await knockIfDue(tx, leaveBy, ctx.uid, ctx.clock.serverNow);
      return { leave_by_id: leaveBy.id, count, crew_knocked: knocked };
    });
  },
});
