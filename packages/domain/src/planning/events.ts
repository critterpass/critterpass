/**
 * Planning domain events (docs/api-contracts.md §2.4). Payloads carry ids and enum values only: a
 * stance event names the stance but never its note, and hiding a place appends no event at all
 * (hides are private to their owner). An organiser's private ask names the two people and nothing
 * else.
 */
import { z } from 'zod';

import { placeStanceSchema } from './stances';

export const PLANNING_EVENT_TYPES = [
  'trip_idea.saved',
  'trip_idea.removed',
  'place.stance_set',
  'place.stance_cleared',
  'plan.legs_updated',
  'ideas.placed',
  'check.member_asked',
  'check.member_ask_answered',
  'trip.areas_changed',
] as const;
export type PlanningEventType = (typeof PLANNING_EVENT_TYPES)[number];

const idea = z.object({ trip_id: z.uuid(), idea_id: z.uuid(), user_id: z.uuid() });
const stance = z.object({ trip_id: z.uuid(), poi_id: z.uuid(), user_id: z.uuid() });

export const PLANNING_EVENT_PAYLOADS = {
  'trip_idea.saved': idea.extend({ poi_id: z.uuid().nullable() }),
  'trip_idea.removed': idea.extend({ deleted: z.boolean() }),
  'place.stance_set': stance.extend({ stance: placeStanceSchema }),
  'place.stance_cleared': stance,
  'plan.legs_updated': z.object({ trip_id: z.uuid(), version_id: z.uuid() }),
  /** Tokek finished placing ideas for the person who asked: their draft is ready to review. */
  'ideas.placed': z.object({
    trip_id: z.uuid(),
    job_id: z.uuid(),
    user_id: z.uuid(),
    change_set_id: z.uuid().nullable(),
  }),
  /** An organiser asked one member about their saves: ids only, never the places or the balance. */
  'check.member_asked': z.object({
    trip_id: z.uuid(),
    ask_id: z.uuid(),
    asker_id: z.uuid(),
    member_id: z.uuid(),
  }),
  'check.member_ask_answered': z.object({
    trip_id: z.uuid(),
    ask_id: z.uuid(),
    member_id: z.uuid(),
    status: z.enum(['accepted', 'declined']),
  }),
  /** A day's area or the trip's stops changed: the ideas seed and the areas' ingest follow. */
  'trip.areas_changed': z.object({ trip_id: z.uuid() }),
} as const satisfies Record<PlanningEventType, z.ZodType>;
