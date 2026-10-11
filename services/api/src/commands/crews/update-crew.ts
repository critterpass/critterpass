/**
 * `update_crew` (docs/api-contracts.md §4.2): any active member renames the crew or changes its
 * art or cover (an earned cover only when they unlocked it); the crew hears it on `crew:{id}`.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { crewChannel, updateCrewPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requireActiveMember, requireCoverAllowed } from './shared';

export const updateCrewCommand = defineCommand({
  name: 'update_crew',
  v: 1,
  schema: updateCrewPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
    await requireCoverAllowed(tx, ctx.uid, payload.cover);
  },
  handle: async (tx, payload, ctx): Promise<{ crew_id: string }> => {
    await tx.query(
      `UPDATE crews SET
         name = CASE WHEN $2::boolean THEN $3 ELSE name END,
         art = CASE WHEN $4::boolean THEN $5 ELSE art END,
         cover = CASE WHEN $6::boolean THEN $7 ELSE cover END
       WHERE id = $1`,
      [
        payload.crew_id,
        payload.name !== undefined,
        payload.name ?? null,
        payload.art !== undefined,
        payload.art ?? null,
        payload.cover !== undefined,
        payload.cover ?? null,
      ],
    );
    await appendDomainEvent(tx, {
      type: 'crew.updated',
      aggregateKind: 'crew',
      aggregateId: payload.crew_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { crew_id: payload.crew_id },
      crewId: payload.crew_id,
    });
    await outbox(tx, crewChannel(payload.crew_id), 'crew.updated', { crew_id: payload.crew_id });
    return { crew_id: payload.crew_id };
  },
});
