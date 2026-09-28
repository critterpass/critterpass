/**
 * `edit_message` (docs/api-contracts.md §4.2): a sender rewrites their own text within the edit
 * window (`chat.edit_window_minutes`, default 15). Nobody edits someone else's message, organisers
 * included; a tombstone or a card cannot be edited.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, editMessagePayloadSchema, findUnsafeLink } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  assertMentionsAreMembers,
  editWindowMinutes,
  hintChat,
  requireChatWriter,
  visibleMessage,
} from './shared';

const EDITABLE_TYPES = new Set(['text', 'photo', 'voice']);

export const editMessageCommand = defineCommand({
  name: 'edit_message',
  v: 1,
  schema: editMessagePayloadSchema,
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
    if (message.deleted_at !== null || !EDITABLE_TYPES.has(message.type)) {
      throw new DomainError('STATE_INVALID', { reason: 'not_editable' });
    }
    const windowMs = (await editWindowMinutes(tx)) * 60_000;
    if (ctx.clock.serverNow.getTime() - message.created_at.getTime() > windowMs) {
      throw new DomainError('STATE_INVALID', { reason: 'edit_window_closed' });
    }
    const unsafe = findUnsafeLink(payload.body);
    if (unsafe !== null)
      throw new DomainError('VALIDATION', { reason: 'unsafe_link', scheme: unsafe });
    if (payload.mentions !== undefined) {
      await assertMentionsAreMembers(tx, message.crew_id, payload.mentions);
    }
    await tx.query(
      `UPDATE messages SET body = $2, edited_at = now(),
         mentions = coalesce($3::uuid[], mentions),
         mentions_guide = coalesce($4, mentions_guide)
       WHERE id = $1`,
      [
        payload.message_id,
        payload.body,
        payload.mentions === undefined ? null : [...new Set(payload.mentions)],
        payload.mentions_guide ?? null,
      ],
    );
    await appendDomainEvent(tx, {
      type: 'chat.message_edited',
      aggregateKind: 'message',
      aggregateId: payload.message_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { crew_id: message.crew_id, message_id: payload.message_id },
      crewId: message.crew_id,
    });
    await hintChat(tx, message.crew_id, 'message.edited', { message_id: payload.message_id });
    return { message_id: payload.message_id };
  },
});
