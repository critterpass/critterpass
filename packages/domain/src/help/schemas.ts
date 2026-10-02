/**
 * Help centre and feedback payloads (docs/api-contracts.md §4.16): a feedback ticket from Settings,
 * a help article or a shake, and the rating-prompt log. Both are offline-capable, so the client
 * supplies each row's id (UUIDv7) and a queued replay lands once.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';

export const FEEDBACK_MOODS = ['grr', 'meh', 'okay', 'good', 'love'] as const;
export const feedbackMoodSchema = z.enum(FEEDBACK_MOODS);
export type FeedbackMood = z.infer<typeof feedbackMoodSchema>;

/** ABOUT chips on 3p-2; `bug` is added (and preselected) when the sheet opens as a problem report. */
export const FEEDBACK_CATEGORIES = [
  'planning',
  'money',
  'guide_chat',
  'critters',
  'other',
  'bug',
] as const;
export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const FEEDBACK_SOURCES = ['settings', 'help', 'article', 'shake'] as const;
export const feedbackSourceSchema = z.enum(FEEDBACK_SOURCES);
export type FeedbackSource = z.infer<typeof feedbackSourceSchema>;

export const FEEDBACK_STATUSES = ['new', 'replied', 'in_tracker', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_TEXT_MAX = 4000;
export const FEEDBACK_TEXT_MIN = 3;
export const FEEDBACK_ATTACHMENTS_MAX = 3;

/** What the device says about itself, sent only when "Include device info" is on. */
export const feedbackDeviceInfoSchema = z.strictObject({
  os: z.string().min(1).max(40),
  os_version: z.string().max(40),
  app_version: z.string().min(1).max(40),
  build: z.string().max(40),
  model: z.string().max(80),
  locale: z.string().max(35),
  tz: z.string().max(64),
  network: z.enum(['wifi', 'cellular', 'none', 'unknown']),
});
export type FeedbackDeviceInfo = z.infer<typeof feedbackDeviceInfoSchema>;

/** Where the traveller was: the screen they came from, the trip, the article they read. */
export const feedbackContextSchema = z.strictObject({
  screen: z.string().max(120).nullable().default(null),
  trip_id: z.uuid().nullable().default(null),
  article_slug: z.string().max(120).nullable().default(null),
});
export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

/**
 * Sendable when there are at least three characters of text, or a mood and a topic together
 * (3p-2's SEND IT stays off otherwise).
 */
export function feedbackSendable(input: {
  readonly text: string;
  readonly mood: FeedbackMood | null;
  readonly category: FeedbackCategory | null;
}): boolean {
  return (
    input.text.trim().length >= FEEDBACK_TEXT_MIN ||
    (input.mood !== null && input.category !== null)
  );
}

export const submitFeedbackPayloadSchema = z
  .strictObject({
    id: uuidV7Schema,
    mood: feedbackMoodSchema.nullable().default(null),
    category: feedbackCategorySchema.nullable().default(null),
    text: z.string().max(FEEDBACK_TEXT_MAX).default(''),
    include_device_info: z.boolean(),
    device_info: feedbackDeviceInfoSchema.nullable().default(null),
    context: feedbackContextSchema.default({ screen: null, trip_id: null, article_slug: null }),
    /** Uploaded first (purpose `feedback`): the auto screenshot and up to two more. */
    media_keys: z.array(z.string().min(1).max(200)).max(FEEDBACK_ATTACHMENTS_MAX).default([]),
    source: feedbackSourceSchema.default('settings'),
  })
  .refine(feedbackSendable, { message: 'needs a few words, or a mood and a topic' })
  .refine((p) => p.include_device_info || p.device_info === null, {
    message: 'device info was not allowed',
    path: ['device_info'],
  });
export type SubmitFeedbackPayload = z.infer<typeof submitFeedbackPayloadSchema>;

export interface SubmitFeedbackResult {
  readonly ticket_id: string;
  readonly ticket_no: number;
}

/** One rating-prompt decision: the arbiter asked the store for a review, or held it back. */
export const recordRatingPromptPayloadSchema = z.strictObject({
  id: uuidV7Schema,
  trip_id: z.uuid().nullable().default(null),
  shown: z.boolean(),
});
export type RecordRatingPromptPayload = z.infer<typeof recordRatingPromptPayloadSchema>;
