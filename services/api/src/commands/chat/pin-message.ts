/**
 * `pin_message` (docs/api-contracts.md §4.2): any active member pins a crew chat message to the
 * trip ("Boat leaves at 8 sharp, gate 3") or takes the pin off. Tombstones and system rows are not
 * pinnable; the pin syncs with the message, so every phone shows it offline too.
 */
import { DomainError, pinMessagePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { hintChat, requireChatWriter, visibleMessage } from './shared';

export const pinMessageCommand = defineCommand({
  name: 'pin_message',
  v: 1,
  schema: pinMessagePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const message = await visibleMessage(tx, payload.message_id);
    await requireChatWriter(tx, message.crew_id);
  },
  handle: async (tx, payload, ctx) => {
    const message = await visibleMessage(tx, payload.message_id);
    if (message.deleted_at !== null || message.sender_kind === 'system') {
      throw new DomainError('STATE_INVALID', { reason: 'not_pinnable' });
    }
    await asSystemRole(tx, () =>
      payload.pinned
        ? tx.query(
            `UPDATE messages SET pinned_at = coalesce(pinned_at, now()),
               pinned_by = coalesce(pinned_by, $2) WHERE id = $1`,
            [payload.message_id, ctx.uid],
          )
        : tx.query('UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = $1', [
            payload.message_id,
          ]),
    );
    await hintChat(tx, message.crew_id, 'message.edited', { message_id: payload.message_id });
    return { message_id: payload.message_id, pinned: payload.pinned };
  },
});
