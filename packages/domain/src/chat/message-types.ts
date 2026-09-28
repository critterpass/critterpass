/**
 * Crew chat message kinds (docs/data-model.md §3.6). `text`, `photo`, `voice` and `system` are
 * built by the chat itself; every other kind is a rich card whose renderer belongs to the feature
 * that posts it (polls, expenses, guide offers, change sets, boost cards, meet-ups, proposals and
 * supplier orders). The app's card registry is typed by this list, so a new kind lands here first.
 */
import { z } from 'zod';

export const MESSAGE_TYPES = [
  'text',
  'photo',
  'voice',
  'system',
  'poll',
  'expense',
  'guide_offer',
  'changeset',
  'boost_card',
  'meetup',
  'proposal',
  'supplier_order',
] as const;
export const messageTypeSchema = z.enum(MESSAGE_TYPES);
export type MessageType = z.infer<typeof messageTypeSchema>;

/** Kinds a member sends through `send_message`; cards are posted by their owning features. */
export const MEMBER_MESSAGE_TYPES = ['text', 'photo', 'voice'] as const;
export type MemberMessageType = (typeof MEMBER_MESSAGE_TYPES)[number];

export const MESSAGE_SENDER_KINDS = ['user', 'guide', 'system'] as const;
export type MessageSenderKind = (typeof MESSAGE_SENDER_KINDS)[number];

/** What a `system` row records; `ref_id` is the member it is about, `body` the new crew name. */
export const SYSTEM_MESSAGE_KINDS = ['member_joined', 'member_left', 'crew_renamed'] as const;
export type SystemMessageKind = (typeof SYSTEM_MESSAGE_KINDS)[number];

export const ATTACHMENT_KINDS = ['photo', 'voice'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** One stored attachment (`messages.attachments`); the worker fills the derived keys. */
export const storedAttachmentSchema = z.object({
  media_id: z.uuid(),
  media_key: z.string().min(1),
  kind: z.enum(ATTACHMENT_KINDS),
  w: z.number().int().positive().nullable(),
  h: z.number().int().positive().nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  /** Photo: the worker's small JPEG. Voice: the normalised AAC. */
  derived_key: z.string().min(1).nullable().optional(),
  /** Voice: normalised amplitude peaks (0–1) for the waveform. */
  peaks: z.array(z.number().min(0).max(1)).max(64).optional(),
});
export type StoredAttachment = z.infer<typeof storedAttachmentSchema>;
