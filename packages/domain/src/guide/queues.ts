/**
 * Guide job queues (docs/api-contracts-async.md §2.2): the crew-chat mention reply (one try, keyed
 * by the mention), the queued answers at each zone's midnight (a cron every 15 minutes), the
 * proactive offer and the phrase card's text and audio.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const GUIDE_QUEUES = {
  mention: 'ai.guide_mention',
  queuedAnswer: 'ai.queued_answer',
  proactive: 'guide.proactive',
  phrase: 'phrase.tts',
} as const;

export const GUIDE_QUEUE_SPECS = {
  'ai.guide_mention': {
    policy: 'exclusive',
    retryLimit: 1,
    retryDelay: 2,
    expireInSeconds: 2 * 60,
    notify: true,
  },
  'ai.queued_answer': {
    policy: 'singleton',
    retryLimit: 3,
    expireInSeconds: 10 * 60,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  },
  'guide.proactive': { policy: 'exclusive', retryLimit: 1, expireInSeconds: 2 * 60 },
  'phrase.tts': {
    policy: 'exclusive',
    retryLimit: 3,
    expireInSeconds: 2 * 60,
    deadLetter: true,
    notify: true,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function guideQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof GUIDE_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(GUIDE_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof GUIDE_QUEUE_SPECS, QueueSpec>;
}

export const GUIDE_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof GUIDE_QUEUE_SPECS, string>> = {
  'ai.guide_mention': "Answers a crew chat @mention in the guide's voice, streamed to the crew",
  'ai.queued_answer': 'Answers the questions queued for the meter reset, at each zone’s midnight',
  'guide.proactive': 'Posts a guide offer to crew chat when a trigger fits, within the daily cap',
  'phrase.tts': 'Writes a custom phrase card and records its audio when a voice is configured',
};

/** The `chat.guide_mentioned` event; the worker reads the mention's id from it. */
export const guideMentionJobSchema = z.object({ event_id: z.uuid() });
export type GuideMentionJob = z.infer<typeof guideMentionJobSchema>;

export const queuedAnswerJobSchema = z.object({}).loose();

/** A bookable slot the guide may offer: our place and the supplier's opaque offer, numbers only. */
export const guideProactiveJobSchema = z.object({
  crew_id: z.uuid(),
  trip_id: z.uuid(),
  trigger: z.object({
    kind: z.literal('bookable_slot'),
    poi_id: z.uuid(),
    offer_ref: z.string().min(1).max(200),
    starts_at: z.iso.datetime({ offset: true }),
    slots: z.number().int().min(1).max(50),
    price_from_minor: z.number().int().nonnegative().nullable(),
    currency: z.string().length(3).nullable(),
  }),
});
export type GuideProactiveJob = z.infer<typeof guideProactiveJobSchema>;

export const phraseJobSchema = z.object({ card_id: z.uuid() });
export type PhraseJob = z.infer<typeof phraseJobSchema>;
