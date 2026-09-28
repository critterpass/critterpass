/**
 * Crew chat worker queues (docs/api-contracts-async.md §2): a photo message's thumbnail and a voice
 * note's normalised AAC, each enqueued by `send_message` in its own transaction and keyed by message.
 */
import { z } from 'zod';

export const CHAT_PHOTO_THUMBNAIL_QUEUE = 'chat.photo_thumbnail';
export const CHAT_VOICE_TRANSCODE_QUEUE = 'chat.voice_transcode';

export const chatMediaJobSchema = z.object({ message_id: z.uuid() });
export type ChatMediaJob = z.infer<typeof chatMediaJobSchema>;
