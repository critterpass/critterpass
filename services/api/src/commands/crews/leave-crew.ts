/**
 * `leave_crew` (docs/api-contracts.md §4.2): the caller leaves a crew, optionally keeping the chat
 * history readable (`former` + keep_in_chat). Organiser roles they held alone pass on first; their
 * trip seats free up; realtime access ends in the same transaction.
 */
import { leaveCrewPayloadSchema, type MembershipChangeResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { departCrew } from './membership';
import { requireActiveMember } from './shared';

export const leaveCrewCommand = defineCommand({
  name: 'leave_crew',
  v: 1,
  schema: leaveCrewPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<MembershipChangeResult> => {
    const result = await departCrew(tx, {
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
    return result;
  },
});
