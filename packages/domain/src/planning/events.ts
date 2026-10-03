/**
 * Planning domain events (docs/api-contracts.md §2.4). Payloads carry ids and enum values only: a
 * stance event names the stance but never its note, and hiding a place appends no event at all
 * (hides are private to their owner).
 */
import { z } from 'zod';

import { placeStanceSchema } from './stances';

export const PLANNING_EVENT_TYPES = [
  'trip_idea.saved',
  'trip_idea.removed',
  'place.stance_set',
  'place.stance_cleared',
  'plan.legs_updated',
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
} as const satisfies Record<PlanningEventType, z.ZodType>;
