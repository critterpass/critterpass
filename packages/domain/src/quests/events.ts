/**
 * Quest and XP domain events. Payloads carry ids, counts and enums only (`domain_events` is exported
 * to analytics and read crew-wide); titles, places and times stay on the quest rows.
 */
import { z } from 'zod';

import { XP_SOURCE_KINDS } from './levels';

export const QUEST_EVENT_TYPES = [
  'quest.published',
  'quest.signed_up',
  'quest.progress',
  'quest.completed',
  'xp.granted',
  'sticker.granted',
] as const;
export type QuestEventType = (typeof QUEST_EVENT_TYPES)[number];

export const QUEST_EVENT_PAYLOADS = {
  // The day's quests are live (one event per trip day).
  'quest.published': z.object({
    trip_id: z.uuid(),
    local_date: z.iso.date(),
    quest_ids: z.array(z.uuid()).min(1),
    fallback_used: z.boolean(),
  }),
  'quest.signed_up': z.object({ trip_id: z.uuid(), quest_id: z.uuid(), user_id: z.uuid() }),
  'quest.progress': z.object({
    trip_id: z.uuid(),
    quest_id: z.uuid(),
    value: z.number().int().min(0),
    target: z.number().int().min(1),
  }),
  'quest.completed': z.object({
    trip_id: z.uuid(),
    quest_id: z.uuid(),
    user_ids: z.array(z.uuid()),
    xp: z.number().int().min(0),
    reveal_at: z.iso.datetime({ offset: true }),
  }),
  'xp.granted': z.object({
    crew_id: z.uuid().nullable(),
    trip_id: z.uuid().nullable(),
    source_kind: z.enum(XP_SOURCE_KINDS),
    source_id: z.uuid(),
    amount: z.number().int().min(0),
    user_ids: z.array(z.uuid()),
    level_before: z.number().int().min(1).nullable(),
    level_after: z.number().int().min(1).nullable(),
  }),
  'sticker.granted': z.object({
    sticker_id: z.uuid(),
    crew_id: z.uuid().nullable(),
    trip_id: z.uuid().nullable(),
    kind: z.enum(['crew_level', 'special']),
    level: z.number().int().min(1).nullable(),
  }),
} as const satisfies Record<QuestEventType, z.ZodType>;

/**
 * Events a quest or an XP source can consume. Later features add theirs to the worker's template
 * registry; the hook queues `quest.evaluate` for every type any registered template consumes.
 */
export const QUEST_INPUT_EVENTS: ReadonlySet<string> = new Set([
  'visit.recorded',
  'expense.added',
  'critter.befriended',
  'copresence.completed',
  'trip.settled',
]);
