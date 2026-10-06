/**
 * Feedback and idea-board domain events (docs/api-contracts.md §4.16). Payloads carry ids and
 * enums only; the words a traveller wrote stay in their ticket or idea row.
 */
import { z } from 'zod';

import { FEEDBACK_CATEGORIES, FEEDBACK_MOODS, FEEDBACK_SOURCES } from './schemas';

export const HELP_EVENT_TYPES = [
  'feedback.submitted',
  'feedback.fix_shipped',
  'idea.submitted',
  'idea.voted',
  'idea.unvoted',
  'rating.prompted',
] as const;
export type HelpEventType = (typeof HELP_EVENT_TYPES)[number];

const vote = z.object({ idea_id: z.uuid(), user_id: z.uuid(), month_key: z.string() });

export const HELP_EVENT_PAYLOADS = {
  'feedback.submitted': z.object({
    ticket_id: z.uuid(),
    ticket_no: z.number().int(),
    user_id: z.uuid(),
    mood: z.enum(FEEDBACK_MOODS).nullable(),
    category: z.enum(FEEDBACK_CATEGORIES).nullable(),
    source: z.enum(FEEDBACK_SOURCES),
    attachments: z.number().int(),
  }),
  'feedback.fix_shipped': z.object({
    ticket_id: z.uuid(),
    ticket_no: z.number().int(),
    user_id: z.uuid(),
    fixed_in_version: z.string().nullable(),
  }),
  'idea.submitted': z.object({ idea_id: z.uuid(), author_id: z.uuid(), locale: z.string() }),
  'idea.voted': vote,
  'idea.unvoted': vote,
  'rating.prompted': z.object({
    user_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    shown: z.boolean(),
  }),
} as const satisfies Record<HelpEventType, z.ZodType>;
