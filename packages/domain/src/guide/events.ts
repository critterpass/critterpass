/**
 * Guide chat domain events (docs/api-contracts.md §4.8). Payloads carry ids and enum values only,
 * never question or answer text: `domain_events` is exported to analytics.
 */
import { z } from 'zod';

export const GUIDE_EVENT_TYPES = [
  'guide.question_queued',
  'guide.question_cancelled',
  'guide.question_answered',
  'guide.answer_rated',
  'guide.offer_posted',
  'phrase.requested',
  'phrase.ready',
] as const;
export type GuideEventType = (typeof GUIDE_EVENT_TYPES)[number];

const question = z.object({ question_id: z.uuid(), user_id: z.uuid() });

export const GUIDE_EVENT_PAYLOADS = {
  'guide.question_queued': question.extend({ thread_id: z.uuid(), answer_after: z.iso.datetime() }),
  'guide.question_cancelled': question,
  // The N-36 passive push goes to `user_id`.
  'guide.question_answered': question.extend({
    thread_id: z.uuid(),
    message_id: z.uuid(),
    trip_id: z.uuid().nullable(),
  }),
  'guide.answer_rated': z.object({
    message_id: z.uuid(),
    thread_id: z.uuid(),
    verdict: z.enum(['up', 'down']),
    trace_id: z.string().nullable(),
  }),
  'guide.offer_posted': z.object({
    crew_id: z.uuid(),
    trip_id: z.uuid(),
    offer_id: z.uuid(),
    message_id: z.uuid(),
  }),
  'phrase.requested': z.object({
    card_id: z.uuid(),
    trip_id: z.uuid(),
    user_id: z.uuid(),
    language: z.string(),
  }),
  'phrase.ready': z.object({
    card_id: z.uuid(),
    user_id: z.uuid(),
    audio_status: z.enum(['ready', 'device', 'failed']),
  }),
} as const satisfies Record<GuideEventType, z.ZodType>;
