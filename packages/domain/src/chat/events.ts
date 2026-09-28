/**
 * Crew chat domain events (docs/api-contracts.md §4.2). Payloads carry ids, sequence numbers and
 * enum values only, never message text: `domain_events` is exported to analytics and read
 * crew-wide. `chat.guide_mentioned` is the hand-off to the guide's crew-chat reply.
 */
import { z } from 'zod';

import { messageTypeSchema } from './message-types';

export const CHAT_EVENT_TYPES = [
  'chat.message_sent',
  'chat.message_edited',
  'chat.message_deleted',
  'chat.reaction_changed',
  'chat.guide_mentioned',
] as const;
export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];

const messageRef = z.object({ crew_id: z.uuid(), message_id: z.uuid() });

export const CHAT_EVENT_PAYLOADS = {
  // Aggregate is the message; the notification audience is computed from these ids.
  'chat.message_sent': messageRef.extend({
    seq: z.number().int().positive(),
    type: messageTypeSchema,
    sender_id: z.uuid(),
    mentions: z.array(z.uuid()),
    mentions_guide: z.boolean(),
    /** Sender of the message this one replies to (mentions-only members hear replies to them). */
    reply_to_sender_id: z.uuid().nullable(),
  }),
  'chat.message_edited': messageRef,
  'chat.message_deleted': messageRef,
  'chat.reaction_changed': messageRef.extend({ user_id: z.uuid(), added: z.boolean() }),
  'chat.guide_mentioned': messageRef.extend({ trip_id: z.uuid().nullable(), asker_id: z.uuid() }),
} as const satisfies Record<ChatEventType, z.ZodType>;
