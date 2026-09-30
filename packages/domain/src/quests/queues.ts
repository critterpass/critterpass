/**
 * Quest job queues (docs/api-contracts-async.md §2.3): the hourly sweep that finds trips whose
 * local morning has come, the per-trip-day generation, and the evaluator that turns events into
 * progress, completions and XP.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const QUEST_QUEUES = {
  sweep: 'quests.sweep',
  generate: 'quests.generate',
  evaluate: 'quest.evaluate',
} as const;

export const QUEST_QUEUE_SPECS = {
  'quests.sweep': {
    policy: 'singleton',
    retryLimit: 2,
    cron: { expr: '2 * * * *', tz: 'UTC' },
  },
  'quests.generate': { policy: 'exclusive', retryLimit: 3, expireInSeconds: 5 * 60 },
  'quest.evaluate': { policy: 'exclusive', retryLimit: 3, notify: true, deadLetter: true },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function questQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof QUEST_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(QUEST_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof QUEST_QUEUE_SPECS, QueueSpec>;
}

export const QUEST_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof QUEST_QUEUE_SPECS, string>> = {
  'quests.sweep': "Queues each travelling trip's quests once its local morning has come",
  'quests.generate': "Writes one trip day's quests: the guide proposes, the validator publishes",
  'quest.evaluate': 'Moves quests and grants XP from one event, never counting an event twice',
};

/** Local hour from which a trip day's quests are written. */
export const QUEST_GENERATION_HOUR = 4;

export const questSweepJobSchema = z.object({}).nullish();
export const questGenerateJobSchema = z.object({ trip_id: z.uuid(), local_date: z.iso.date() });
export type QuestGenerateJob = z.infer<typeof questGenerateJobSchema>;
export const questEvaluateJobSchema = z.object({ event_id: z.uuid() });
export type QuestEvaluateJob = z.infer<typeof questEvaluateJobSchema>;
