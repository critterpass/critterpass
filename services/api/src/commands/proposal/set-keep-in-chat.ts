/**
 * `set_keep_in_chat` (docs/api-contracts.md §4.7): after a dropout, an organiser of the crew
 * decides whether the member who left keeps reading the crew chat ("Keep Dev in the chat").
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, setKeepInChatPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const setKeepInChatCommand = defineCommand({
  name: 'set_keep_in_chat',
  v: 1,
  schema: setKeepInChatPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ organiser: boolean }>(
      'SELECT app.is_crew_organiser($1) AS organiser',
      [payload.crew_id],
    );
    if (rows[0]?.organiser !== true)
      throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rowCount } = await tx.query(
        'UPDATE crew_members SET keep_in_chat = $3 WHERE crew_id = $1 AND user_id = $2',
        [payload.crew_id, payload.uid, payload.keep],
      );
      if ((rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'member' });
      await appendDomainEvent(tx, {
        type: 'crew.member_updated',
        aggregateKind: 'crew',
        aggregateId: payload.crew_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { crew_id: payload.crew_id, user_id: payload.uid, keep_in_chat: payload.keep },
        crewId: payload.crew_id,
        tripId: null,
      });
      return { crew_id: payload.crew_id, uid: payload.uid, keep: payload.keep };
    }),
});
