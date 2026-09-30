/**
 * Explore job queues (docs/api-contracts-async.md §2): the swipe deck for a new session (ranked in
 * code, noted by the guide) and the crew's one-line Q&A snippet about a place, summarised from that
 * trip's own chat when it mentions the place again.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const EXPLORE_QUEUES = {
  swipeDeck: 'ai.swipe_deck',
  placeQna: 'explore.place_qna_summary',
} as const;

export const EXPLORE_QUEUE_SPECS = {
  'ai.swipe_deck': { policy: 'exclusive', retryLimit: 2, expireInSeconds: 5 * 60 },
  'explore.place_qna_summary': { policy: 'exclusive', retryLimit: 2, expireInSeconds: 2 * 60 },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function exploreQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof EXPLORE_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(EXPLORE_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof EXPLORE_QUEUE_SPECS, QueueSpec>;
}

export const EXPLORE_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof EXPLORE_QUEUE_SPECS, string>
> = {
  'ai.swipe_deck': "Ranks a swipe session's 30 cards and has the guide note each one",
  'explore.place_qna_summary': "Sums up what a trip's crew chat last said about a place",
};

export const swipeDeckJobSchema = z.object({ session_id: z.uuid() });
export type SwipeDeckJob = z.infer<typeof swipeDeckJobSchema>;

export const placeQnaJobSchema = z.object({ trip_id: z.uuid(), poi_id: z.uuid() });
export type PlaceQnaJob = z.infer<typeof placeQnaJobSchema>;
