/**
 * `set_active_crew` (docs/api-contracts.md §4.2): the crew Home shows and themes itself for. Only
 * a crew the caller is an active member of.
 */
import { appendDomainEvent } from '@cp/db';
import { crewIdPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requireActiveMember } from './shared';

export const setActiveCrewCommand = defineCommand({
  name: 'set_active_crew',
  v: 1,
  schema: crewIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<{ crew_id: string }> => {
    await tx.query(
      `INSERT INTO user_settings (user_id, active_crew_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET active_crew_id = EXCLUDED.active_crew_id`,
      [ctx.uid, payload.crew_id],
    );
    await appendDomainEvent(tx, {
      type: 'user.active_crew_changed',
      aggregateKind: 'user',
      aggregateId: ctx.uid,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { user_id: ctx.uid, crew_id: payload.crew_id },
    });
    return { crew_id: payload.crew_id };
  },
});
