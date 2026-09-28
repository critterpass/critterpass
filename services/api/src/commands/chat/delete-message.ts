/**
 * `delete_message` (docs/api-contracts.md §4.2): a sender deletes their own message at any time.
 * The row stays in order as a tombstone ("Message deleted"): body and attachments are cleared, and
 * deleting twice is a no-op.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, messageIdPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { hintChat, requireChatWriter, visibleMessage } from './shared';

export const deleteMessageCommand = defineCommand({
  name: 'delete_message',
  v: 1,
  schema: messageIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const message = await visibleMessage(tx, payload.message_id);
    await requireChatWriter(tx, message.crew_id);
    if (message.sender_kind !== 'user' || message.sender_id !== ctx.uid) {
      throw new DomainError('FORBIDDEN', { reason: 'not_sender' });
    }
  },
  handle: async (tx, payload, ctx): Promise<{ message_id: string }> => {
    const message = await visibleMessage(tx, payload.message_id);
    if (message.deleted_at !== null) return { message_id: payload.message_id };
    await tx.query(
      `UPDATE messages SET deleted_at = now(), body = '', attachments = '[]'::jsonb,
         mentions = '{}', mentions_guide = false
       WHERE id = $1`,
      [payload.message_id],
    );
    await appendDomainEvent(tx, {
      type: 'chat.message_deleted',
      aggregateKind: 'message',
      aggregateId: payload.message_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { crew_id: message.crew_id, message_id: payload.message_id },
      crewId: message.crew_id,
    });
    await hintChat(tx, message.crew_id, 'message.deleted', { message_id: payload.message_id });
    return { message_id: payload.message_id };
  },
});
