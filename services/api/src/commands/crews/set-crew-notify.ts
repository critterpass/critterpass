/**
 * `set_crew_notify` (docs/api-contracts.md §4.2, doc delta): the one per-crew notification
 * setting, all / mentions / off (mentions when never chosen), read by crew chat notifications.
 */
import { setCrewNotifyPayloadSchema, type SetCrewNotifyResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requireActiveMember } from './shared';

export const setCrewNotifyCommand = defineCommand({
  name: 'set_crew_notify',
  v: 1,
  schema: setCrewNotifyPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<SetCrewNotifyResult> => {
    await tx.query(
      `UPDATE crew_members SET notify_level = $3 WHERE crew_id = $1 AND user_id = $2`,
      [payload.crew_id, ctx.uid, payload.level],
    );
    return { crew_id: payload.crew_id, level: payload.level };
  },
});
