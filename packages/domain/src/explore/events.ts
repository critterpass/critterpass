/**
 * Swipe events (docs/api-contracts.md §4.6). Payloads carry ids and counts only: a vote event never
 * names its verdict, so a "no" cannot be read back from the event log's consumers either.
 */
import { z } from 'zod';

export const EXPLORE_EVENT_TYPES = [
  'swipe.started',
  'swipe.deck_ready',
  'swipe.voted',
  'swipe.undone',
  'swipe.matched',
  'swipe.ended',
] as const;
export type ExploreEventType = (typeof EXPLORE_EVENT_TYPES)[number];

const session = z.object({ trip_id: z.uuid(), session_id: z.uuid() });
const card = session.extend({ poi_id: z.uuid(), user_id: z.uuid() });

export const EXPLORE_EVENT_PAYLOADS = {
  'swipe.started': session.extend({ destination_id: z.uuid(), started_by: z.uuid() }),
  'swipe.deck_ready': session.extend({ cards: z.number().int().nonnegative() }),
  'swipe.voted': card,
  'swipe.undone': card,
  'swipe.matched': session.extend({
    poi_id: z.uuid(),
    match_id: z.uuid(),
    change_set_id: z.uuid().nullable(),
  }),
  'swipe.ended': session,
} as const satisfies Record<ExploreEventType, z.ZodType>;
