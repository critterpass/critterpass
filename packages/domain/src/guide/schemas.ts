/**
 * Guide chat wire shapes (docs/api-contracts.md §4.8, §5.3): the streamed turn and crew-mention
 * bodies, the guide commands' payloads and the realtime payloads the guide publishes.
 */
import { z } from 'zod';

/** A question's text: what the guide sheet, the queue and the crew mention accept. */
export const guideQuestionTextSchema = z.string().trim().min(1).max(2000);

export const GUIDE_THREAD_MODES = ['private', 'group'] as const;
export const guideThreadModeSchema = z.enum(GUIDE_THREAD_MODES);
export type GuideThreadMode = z.infer<typeof guideThreadModeSchema>;

export const guideAttachmentSchema = z.strictObject({
  kind: z.enum(['photo', 'place', 'booking']),
  /** Media key, place id or booking id. */
  ref: z.string().min(1).max(200),
});

/** `POST /v1/guide/threads/{id}/turns`. `thread_mode` picks GROUP or JUST ME for a new thread. */
export const guideTurnBodySchema = z.strictObject({
  text: guideQuestionTextSchema,
  mode: z.enum(['text', 'voice']).default('text'),
  thread_mode: guideThreadModeSchema.default('private'),
  context: z
    .strictObject({
      screen: z.string().max(64).optional(),
      trip_id: z.uuid().nullable().optional(),
      day: z.number().int().min(1).max(60).optional(),
    })
    .default({}),
  attachments: z.array(guideAttachmentSchema).max(5).default([]),
});
export type GuideTurnBody = z.infer<typeof guideTurnBodySchema>;

/** `POST /v1/guide/crew/{crew_id}/mentions`: the caller's own `send_message` that mentioned the guide. */
export const guideMentionBodySchema = z.strictObject({ message_id: z.uuid() });

export const queueGuideQuestionPayloadSchema = z.strictObject({
  thread_id: z.uuid(),
  text: guideQuestionTextSchema,
});
export type QueueGuideQuestionPayload = z.infer<typeof queueGuideQuestionPayloadSchema>;

export const cancelQueuedQuestionPayloadSchema = z.strictObject({ question_id: z.uuid() });

export const rateGuideAnswerPayloadSchema = z.strictObject({
  message_id: z.uuid(),
  verdict: z.enum(['up', 'down']),
  note: z.string().trim().max(500).optional(),
});

export const PHRASE_REGISTERS = ['casual', 'polite', 'formal'] as const;

export const requestPhraseCardPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** What to say, in English or a curated phrase context key (`taxi.address`). */
  purpose: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300).optional(),
  /** BCP 47 language of the card. */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u),
  register: z.enum(PHRASE_REGISTERS),
});
export type RequestPhraseCardPayload = z.infer<typeof requestPhraseCardPayloadSchema>;

/** `guide.token` on `crew_chat:{crew_id}` and `token` on `guide_thread:{id}`. */
export const rtGuideTokenSchema = z.object({
  stream_id: z.uuid(),
  seq: z.number().int().nonnegative(),
  text: z.string(),
});
export type RtGuideToken = z.infer<typeof rtGuideTokenSchema>;
