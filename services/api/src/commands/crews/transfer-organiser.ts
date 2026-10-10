/**
 * `transfer_organiser` (docs/api-contracts.md §4.2): the crew's organiser hands the crew to another
 * active member they picked. Staying, the caller becomes a member. Leaving, the new organiser also
 * takes the caller's organiser seat on each live trip they are on, then the caller leaves as
 * `leave_crew` does (any role nobody picked up passes to the longest-standing member).
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  crewChannel,
  DomainError,
  transferOrganiserPayloadSchema,
  type TransferOrganiserResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { departCrew } from './membership';
import { requireActiveMember } from './shared';

export const transferOrganiserCommand = defineCommand({
  name: 'transfer_organiser',
  v: 1,
  schema: transferOrganiserPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const me = await requireActiveMember(tx, payload.crew_id, ctx.uid);
    if (me.role !== 'organiser') throw new DomainError('FORBIDDEN', { reason: 'not_organiser' });
    if (payload.to_uid === ctx.uid) {
      throw new DomainError('VALIDATION', { reason: 'already_organiser' });
    }
    const { rows } = await tx.query(
      `SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
      [payload.crew_id, payload.to_uid],
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'member' });
  },
  handle: async (tx, payload, ctx): Promise<TransferOrganiserResult> => {
    await tx.query(
      `UPDATE crew_members SET role = 'organiser'
        WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
      [payload.crew_id, payload.to_uid],
    );
    if (payload.leave) {
      // Trips the leaver runs where the new organiser holds a seat go to them, not to whoever
      // joined first.
      await tx.query(
        `UPDATE trip_participants tp SET role = 'organiser'
           FROM trips t
          WHERE tp.trip_id = t.id AND t.crew_id = $1 AND t.status NOT IN ('cancelled', 'archived')
            AND tp.user_id = $2 AND tp.rsvp NOT IN ('out', 'waitlisted')
            AND EXISTS (SELECT 1 FROM trip_participants me WHERE me.trip_id = t.id
                         AND me.user_id = $3 AND me.role = 'organiser')`,
        [payload.crew_id, payload.to_uid, ctx.uid],
      );
    } else {
      await tx.query(
        `UPDATE crew_members SET role = 'member'
          WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
        [payload.crew_id, ctx.uid],
      );
    }
    await appendDomainEvent(tx, {
      type: 'crew.organiser_changed',
      aggregateKind: 'crew',
      aggregateId: payload.crew_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { crew_id: payload.crew_id, user_id: payload.to_uid, from_user_id: ctx.uid },
      crewId: payload.crew_id,
    });
    await outbox(tx, crewChannel(payload.crew_id), 'crew.updated', { crew_id: payload.crew_id });

    if (!payload.leave) {
      return {
        crew_id: payload.crew_id,
        organiser: payload.to_uid,
        left: false,
        handed_off: [{ scope: 'crew', id: payload.crew_id }],
        freed_trips: [],
      };
    }
    const departed = await departCrew(tx, {
      crewId: payload.crew_id,
      memberId: ctx.uid,
      actorId: ctx.uid,
      status: payload.keep_in_chat ? 'former' : 'left',
      keepInChat: payload.keep_in_chat,
    });
    await tx.query(
      'UPDATE user_settings SET active_crew_id = NULL WHERE user_id = $1 AND active_crew_id = $2',
      [ctx.uid, payload.crew_id],
    );
    return {
      ...departed,
      organiser: payload.to_uid,
      left: true,
      handed_off: [{ scope: 'crew', id: payload.crew_id }, ...departed.handed_off],
    };
  },
});
