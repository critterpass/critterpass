/**
 * Quest realtime hints on `trip_quests:{trip_id}` (ids and counts; rows arrive through sync) and
 * push copy. A reward reveals on every phone at `reveal_at`, a moment just ahead of the server's
 * clock, so devices that apply their server clock offset spin it together.
 */
import { z } from 'zod';

export const QUESTS_RT = {
  progress: 'quest.progress',
  completed: 'quest.completed',
  reward: 'reward',
} as const;

/** How far ahead of the grant the shared reveal is set. */
export const REVEAL_DELAY_MS = 1500;

export const questProgressHintSchema = z.object({
  quest_id: z.uuid(),
  value: z.number().int().min(0),
  target: z.number().int().min(1),
});

export const questRewardHintSchema = z.object({
  kind: z.enum(['quest', 'crew_level']),
  quest_id: z.uuid().nullable(),
  sticker_id: z.uuid().nullable(),
  xp: z.number().int().min(0),
  level: z.number().int().min(1).nullable(),
  reveal_at: z.iso.datetime({ offset: true }),
});
export type QuestRewardHint = z.infer<typeof questRewardHintSchema>;

export function revealAt(now: Date): Date {
  return new Date(now.getTime() + REVEAL_DELAY_MS);
}

interface QuestCopy {
  readonly id: string;
  readonly message: string;
}

export const QUEST_PUSH = {
  readyTitle: /*i18n*/ { id: 'notifications.quests.ready.title', message: "Today's crew quests" },
  readyBody: /*i18n*/ {
    id: 'notifications.quests.ready.body',
    message: '{count} quests are up for {place}.',
  },
  doneTitle: /*i18n*/ { id: 'notifications.quests.done.title', message: 'Quest done: {title}' },
  doneBody: /*i18n*/ { id: 'notifications.quests.done.body', message: '+{xp} XP for the crew.' },
} as const satisfies Record<string, QuestCopy>;
