/**
 * `mirror_alarm_state` (doc delta): a phone reports the OS alarm it holds for a leave-by (scheduled,
 * ringing, snoozed, stopped, cancelled). The mirror is device-authoritative; the server only reads
 * it to decide who still needs the remote copy of the alarm.
 */
import { DomainError, mirrorAlarmStatePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireLeaveByMember } from './shared';

export const mirrorAlarmStateCommand = defineCommand({
  name: 'mirror_alarm_state',
  v: 1,
  schema: mirrorAlarmStatePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
    const { rows } = await tx.query('SELECT 1 FROM devices WHERE id = $1 AND user_id = $2', [
      payload.device_id,
      ctx.uid,
    ]);
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'device' });
  },
  handle: async (tx, payload, ctx) => {
    const leaveBy = await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ sync_version: number }>(
        `INSERT INTO alarms (user_id, device_id, leave_by_id, trip_id, fire_at, os_alarm_id, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (device_id, leave_by_id) DO UPDATE
           SET fire_at = EXCLUDED.fire_at, os_alarm_id = coalesce(EXCLUDED.os_alarm_id, alarms.os_alarm_id),
               state = EXCLUDED.state, sync_version = alarms.sync_version + 1
         RETURNING sync_version`,
        [
          ctx.uid,
          payload.device_id,
          leaveBy.id,
          leaveBy.trip_id,
          payload.fire_at,
          payload.os_alarm_id ?? null,
          payload.state,
        ],
      );
      return { leave_by_id: leaveBy.id, state: payload.state, sync_version: rows[0]?.sync_version };
    });
  },
});
