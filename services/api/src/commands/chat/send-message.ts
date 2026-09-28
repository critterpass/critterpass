/**
 * `send_message` (docs/api-contracts.md §4.2): an active member posts text, photos or one voice
 * note. The command's `op_id` is the message id, so an offline send replayed from the queue (or a
 * notification REPLY retried) lands on one row. The insert trigger assigns the crew's next `seq`
 * under the counter row lock, so order is server receive order, never a device clock.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  CHAT_PHOTO_THUMBNAIL_QUEUE,
  CHAT_VOICE_TRANSCODE_QUEUE,
  DomainError,
  findUnsafeLink,
  sendMessagePayloadSchema,
  type ChatMediaJob,
  type MemberMessageType,
  type SendMessageResult,
  type StoredAttachment,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import {
  assertMentionsAreMembers,
  hintChat,
  requireChatWriter,
  resolveAttachments,
  visibleMessage,
} from './shared';

function typeOf(attachments: readonly StoredAttachment[]): MemberMessageType {
  if (attachments.some((attachment) => attachment.kind === 'voice')) return 'voice';
  return attachments.length > 0 ? 'photo' : 'text';
}

/** The trip the crew is on or planning now, for the guide's context; null when there is none. */
async function currentTrip(tx: pg.PoolClient, crewId: string): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM trips WHERE crew_id = $1 AND phase IN ('in', 'pre', 'planning')
      ORDER BY (phase = 'in') DESC, (phase = 'pre') DESC, created_at DESC LIMIT 1`,
    [crewId],
  );
  return rows[0]?.id ?? null;
}

export const sendMessageCommand = defineCommand({
  name: 'send_message',
  v: 1,
  schema: sendMessagePayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'chat_reply',
  authorize: async (tx, payload) => {
    await requireChatWriter(tx, payload.crew_id);
  },
  handle: async (tx, payload, ctx): Promise<SendMessageResult> => {
    const unsafe = findUnsafeLink(payload.body);
    if (unsafe !== null)
      throw new DomainError('VALIDATION', { reason: 'unsafe_link', scheme: unsafe });
    await assertMentionsAreMembers(tx, payload.crew_id, payload.mentions);
    let replyToSender: string | null = null;
    if (payload.reply_to !== undefined) {
      const parent = await visibleMessage(tx, payload.reply_to);
      if (parent.crew_id !== payload.crew_id)
        throw new DomainError('NOT_FOUND', { reason: 'message' });
      replyToSender = parent.sender_id;
    }
    const attachments = await resolveAttachments(tx, ctx.uid, payload.attachments);
    const type = typeOf(attachments);
    const tripId = await currentTrip(tx, payload.crew_id);

    const { rows } = await tx.query<{ seq: string }>(
      `INSERT INTO messages (id, crew_id, trip_id, sender_kind, sender_id, type, body, reply_to_id,
         mentions, mentions_guide, attachments)
       VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, $8::uuid[], $9, $10::jsonb)
       RETURNING seq`,
      [
        ctx.opId,
        payload.crew_id,
        tripId,
        ctx.uid,
        type,
        payload.body,
        payload.reply_to ?? null,
        [...new Set(payload.mentions)],
        payload.mentions_guide,
        JSON.stringify(attachments),
      ],
    );
    const seq = Number(rows[0]?.seq);

    await appendDomainEvent(tx, {
      type: 'chat.message_sent',
      aggregateKind: 'message',
      aggregateId: ctx.opId,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        crew_id: payload.crew_id,
        message_id: ctx.opId,
        seq,
        type,
        sender_id: ctx.uid,
        mentions: [...new Set(payload.mentions)],
        mentions_guide: payload.mentions_guide,
        reply_to_sender_id: replyToSender,
      },
      crewId: payload.crew_id,
      ...(tripId === null ? {} : { tripId }),
    });
    if (payload.mentions_guide) {
      await appendDomainEvent(tx, {
        type: 'chat.guide_mentioned',
        aggregateKind: 'message',
        aggregateId: ctx.opId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          crew_id: payload.crew_id,
          message_id: ctx.opId,
          trip_id: tripId,
          asker_id: ctx.uid,
        },
        crewId: payload.crew_id,
        ...(tripId === null ? {} : { tripId }),
      });
    }
    const job: ChatMediaJob = { message_id: ctx.opId };
    if (type === 'photo') {
      await sendInTx(tx, CHAT_PHOTO_THUMBNAIL_QUEUE, job, { singletonKey: ctx.opId });
    } else if (type === 'voice') {
      await sendInTx(tx, CHAT_VOICE_TRANSCODE_QUEUE, job, { singletonKey: ctx.opId });
    }
    await hintChat(tx, payload.crew_id, 'message.created', { message_id: ctx.opId, seq });
    return { message_id: ctx.opId, seq };
  },
});
