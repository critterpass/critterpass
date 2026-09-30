/**
 * `set_readiness` (docs/api-contracts.md §4.12): a member says they are up (or back to not up) from
 * the app, the alarm, the Live Activity, a widget or a notification action (action key scope
 * `readiness`). Every crew device learns it on `trip_dayof:` and through sync; a repeat that
 * changes nothing publishes nothing.
 */
import { appendDomainEvent } from '@cp/db';
import { setReadinessPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { publishReadiness, requireLeaveByMember } from './shared';

export const setReadinessCommand = defineCommand({
  name: 'set_readiness',
  v: 1,
  schema: setReadinessPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'readiness',
  authorize: async (tx, payload, ctx) => {
    await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const leaveBy = await requireLeaveByMember(tx, payload.leave_by_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO readiness (leave_by_id, trip_id, user_id, state, source, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (leave_by_id, user_id) DO UPDATE
           SET state = EXCLUDED.state, source = EXCLUDED.source, changed_at = EXCLUDED.changed_at
           WHERE readiness.state IS DISTINCT FROM EXCLUDED.state
         RETURNING id`,
        [leaveBy.id, leaveBy.trip_id, ctx.uid, payload.state, payload.source, ctx.clock.serverNow],
      );
      const changed = rows.length > 0;
      if (changed) {
        await appendDomainEvent(tx, {
          type: 'readiness.changed',
          aggregateKind: 'leave_by',
          aggregateId: leaveBy.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: leaveBy.trip_id,
          payload: {
            trip_id: leaveBy.trip_id,
            leave_by_id: leaveBy.id,
            user_id: ctx.uid,
            state: payload.state,
            source: payload.source,
          },
        });
        await publishReadiness(tx, leaveBy.trip_id, leaveBy.id);
      }
      return { leave_by_id: leaveBy.id, state: payload.state, changed };
    });
  },
});
