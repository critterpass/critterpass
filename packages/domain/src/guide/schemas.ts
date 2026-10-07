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
  /** A voice turn with replies muted: the answer streams as text only, no audio is made. */
  speak: z.boolean().optional(),
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

const languageTag = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u);

/**
 * `record_phrase_practice`: one practice of a curated or custom phrase card. `said` is what the
 * device heard (absent when the pronunciation check is off and the traveller tapped "I said it").
 */
export const recordPhrasePracticePayloadSchema = z.strictObject({
  phrase_id: z.uuid(),
  /** The trip the practice counts for (its quests); null when practising outside a trip. */
  trip_id: z.uuid().nullable(),
  language: languageTag,
  outcome: z.enum(['ok', 'retry']),
  score: z.number().int().min(0).max(100).optional(),
});
export type RecordPhrasePracticePayload = z.infer<typeof recordPhrasePracticePayloadSchema>;

export const menuOcrLineSchema = z.strictObject({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(200),
  /** Left, top, width and height as fractions of the frame. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type MenuOcrLine = z.infer<typeof menuOcrLineSchema>;

/** `POST /v1/camera/menu`: the locked frame's text lines and, optionally, its downscaled crop. */
export const cameraMenuBodySchema = z.strictObject({
  trip_id: z.uuid().nullable(),
  ocr_lines: z.array(menuOcrLineSchema).min(1).max(120),
  /** Base64 JPEG, longest side at most 1568 px. Never stored. */
  crop_b64: z.string().max(1_600_000).optional(),
  /** The trip's local currency, a hint when the menu prints no symbol. */
  currency_hint: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional(),
});
export type CameraMenuBody = z.infer<typeof cameraMenuBodySchema>;

/** `POST /v1/guide/phrase-feedback`: what the device heard against the phrase, for a short tip. */
export const phraseFeedbackBodySchema = z.strictObject({
  phrase_id: z.uuid(),
  language: languageTag,
  recognised: z.string().trim().max(300),
});
export type PhraseFeedbackBody = z.infer<typeof phraseFeedbackBodySchema>;

/** `guide.token` on `crew_chat:{crew_id}` and `token` on `guide_thread:{id}`. */
export const rtGuideTokenSchema = z.object({
  stream_id: z.uuid(),
  seq: z.number().int().nonnegative(),
  text: z.string(),
});
export type RtGuideToken = z.infer<typeof rtGuideTokenSchema>;
