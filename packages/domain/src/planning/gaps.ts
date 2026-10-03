/**
 * Free time in the plan (docs/api-contracts-planning.md, gaps): windows of an hour or more between
 * 07:00 and 22:00 when two or more people are free, with who is free, where the others are until
 * when, and the next fixed item. Gap ideas fill one window with up to three options.
 */
import { z } from 'zod';

import { clockTimeSchema, fitReasonSchema } from './fit';

export const GAP_MIN_MINUTES = 60;

export const gapBusySchema = z.strictObject({
  user_ids: z.array(z.uuid()).min(1),
  stable_id: z.uuid(),
  until: clockTimeSchema,
});

export const gapSchema = z.strictObject({
  day_id: z.uuid(),
  day_no: z.number().int().min(1).max(366),
  from: clockTimeSchema,
  to: clockTimeSchema,
  minutes: z.number().int().min(GAP_MIN_MINUTES),
  who_free: z.array(z.uuid()).min(2),
  busy: z.array(gapBusySchema),
  after_item: z.uuid().nullable(),
  next_item: z.uuid().nullable(),
});
export type Gap = z.infer<typeof gapSchema>;

export const GAP_IDEA_KINDS = ['single', 'pair', 'stay'] as const;
export const gapIdeaKindSchema = z.enum(GAP_IDEA_KINDS);

export const gapIdeaSchema = z.strictObject({
  kind: gapIdeaKindSchema,
  /** One place, two back to back, or none for "back to the stay". */
  poi_ids: z.array(z.uuid()).max(2),
  minutes: z.number().int().min(0),
  cost_each_minor: z.number().int().min(0).nullable(),
  currency: z.string().length(3).nullable(),
  saver_id: z.uuid().nullable(),
  voted_by: z.array(z.uuid()),
  reasons: z.array(fitReasonSchema).max(8),
});
export type GapIdea = z.infer<typeof gapIdeaSchema>;

export const gapIdeasResultSchema = z.strictObject({
  who_free: z.array(z.uuid()),
  context: z.strictObject({
    busy: z.array(gapBusySchema),
    next_item: z.uuid().nullable(),
  }),
  ideas: z.array(gapIdeaSchema).max(3),
});
export type GapIdeasResult = z.infer<typeof gapIdeasResultSchema>;
