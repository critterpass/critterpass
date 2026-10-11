/**
 * Wire schemas for the crew chat commands (docs/api-contracts.md §4.2): send, edit, delete, react,
 * mark read, report and mute. `send_message`'s `op_id` is the message id, so an offline send and
 * its replays land on one row; order comes from the server's `seq`, never the client.
 */
import { z } from 'zod';

import { reportReasonSchema } from '../admin/moderation-kinds';
import { ATTACHMENT_KINDS, stickerPoseSchema } from './message-types';
import {
  isReactionKey,
  MESSAGE_ATTACHMENTS_MAX,
  MESSAGE_BODY_MAX,
  MESSAGE_MENTIONS_MAX,
  normaliseBody,
  VOICE_NOTE_MAX_MS,
} from './validation';

const bodySchema = z.string().max(MESSAGE_BODY_MAX).transform(normaliseBody);

export const outgoingAttachmentSchema = z.object({
  /** The key the media presign returned; the server resolves it to the sender's media object. */
  media_key: z.string().min(1).max(200),
  kind: z.enum(ATTACHMENT_KINDS),
  w: z.number().int().positive().max(20_000).optional(),
  h: z.number().int().positive().max(20_000).optional(),
  duration_ms: z.number().int().positive().max(VOICE_NOTE_MAX_MS).optional(),
  peaks: z.array(z.number().min(0).max(1)).max(64).optional(),
});
export type OutgoingAttachment = z.infer<typeof outgoingAttachmentSchema>;

export const sendMessagePayloadSchema = z
  .object({
    crew_id: z.uuid(),
    body: bodySchema.default(''),
    mentions: z.array(z.uuid()).max(MESSAGE_MENTIONS_MAX).default([]),
    mentions_guide: z.boolean().default(false),
    reply_to: z.uuid().optional(),
    attachments: z.array(outgoingAttachmentSchema).max(MESSAGE_ATTACHMENTS_MAX).default([]),
    /** A critter sticker instead of text or media: a form the sender has met, in one pose. */
    sticker: z.object({ form_id: z.uuid(), pose: stickerPoseSchema }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sticker !== undefined) {
      if (value.body !== '' || value.attachments.length > 0 || value.mentions_guide) {
        ctx.addIssue({
          code: 'custom',
          message: 'a sticker carries no text or media',
          path: ['sticker'],
        });
      }
      return;
    }
    if (value.body === '' && value.attachments.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'empty message', path: ['body'] });
    }
    const voices = value.attachments.filter((attachment) => attachment.kind === 'voice');
    if (voices.length > 0 && value.attachments.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'one voice note per message',
        path: ['attachments'],
      });
    }
    if (voices.some((voice) => voice.duration_ms === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'voice note needs a duration',
        path: ['attachments'],
      });
    }
  });
export type SendMessagePayload = z.infer<typeof sendMessagePayloadSchema>;

export interface SendMessageResult {
  readonly message_id: string;
  readonly seq: number;
}

export const editMessagePayloadSchema = z.object({
  message_id: z.uuid(),
  body: bodySchema.refine((body) => body !== '', 'empty message'),
  mentions: z.array(z.uuid()).max(MESSAGE_MENTIONS_MAX).optional(),
  mentions_guide: z.boolean().optional(),
});
export type EditMessagePayload = z.infer<typeof editMessagePayloadSchema>;

export const messageIdPayloadSchema = z.object({ message_id: z.uuid() });
export type MessageIdPayload = z.infer<typeof messageIdPayloadSchema>;

export const reactMessagePayloadSchema = z.object({
  message_id: z.uuid(),
  /** One emoji, or a critter reaction key (`c112.cheer`). */
  emoji: z.string().refine(isReactionKey, 'not a reaction'),
  /** Absent: toggle. The app sends the state it showed so a replayed queue lands the same way. */
  on: z.boolean().optional(),
});
export type ReactMessagePayload = z.infer<typeof reactMessagePayloadSchema>;

export interface ReactMessageResult {
  readonly message_id: string;
  readonly emoji: string;
  readonly on: boolean;
}

export const markReadPayloadSchema = z.object({
  crew_id: z.uuid(),
  seq: z.number().int().nonnegative(),
});
export type MarkReadPayload = z.infer<typeof markReadPayloadSchema>;

export interface MarkReadResult {
  readonly crew_id: string;
  /** The stored marker after the call: never lower than before. */
  readonly last_read_seq: number;
}

export const reportMessagePayloadSchema = z.object({
  message_id: z.uuid(),
  reason: reportReasonSchema,
  note: z.string().trim().min(1).max(280).nullish(),
});
export type ReportMessagePayload = z.infer<typeof reportMessagePayloadSchema>;

export const muteMemberPayloadSchema = z.object({
  crew_id: z.uuid(),
  uid: z.uuid(),
  muted: z.boolean(),
});
export type MuteMemberPayload = z.infer<typeof muteMemberPayloadSchema>;

export interface MuteMemberResult {
  readonly uid: string;
  readonly muted: boolean;
}

/** A former member who kept the chat: ask the organisers to let them back in, or drop the chat. */
export const keptChatPayloadSchema = z.object({ crew_id: z.uuid() });
export type KeptChatPayload = z.infer<typeof keptChatPayloadSchema>;

/** Pin a crew chat message to the trip, or take the pin off. */
export const pinMessagePayloadSchema = z.object({ message_id: z.uuid(), pinned: z.boolean() });
export type PinMessagePayload = z.infer<typeof pinMessagePayloadSchema>;
