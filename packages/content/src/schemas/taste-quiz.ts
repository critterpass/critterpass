/**
 * `taste_quiz` release: the six this-or-that questions (3a-4) and the tag taxonomy their answers
 * map to. Tags are the vocabulary taste profiles, POI tags and the guide share.
 */
import { z } from 'zod';

import { slugSchema } from './common';

export const TASTE_TAGS = [
  'street_food',
  'sit_down_dining',
  'coffee',
  'nightlife',
  'quiet_evenings',
  'early_starts',
  'late_starts',
  'easy_pace',
  'packed_days',
  'nature',
  'hiking',
  'beach',
  'culture',
  'history',
  'temples',
  'museums',
  'markets',
  'shopping',
  'wellness',
  'adventure',
  'photo_spots',
  'local_life',
  'splurge',
  'thrifty',
] as const;
export const tasteTagSchema = z.enum(TASTE_TAGS);
export type TasteTag = z.infer<typeof tasteTagSchema>;

export const quizSideSchema = z
  .object({
    /** Card headline, shown in caps: "SUNRISE SUMMIT". */
    label: z.string().min(1).max(24),
    /** Line under it: "Up at 3, on top by 6". */
    line: z.string().min(1).max(40),
    tags: z.array(tasteTagSchema).min(1).max(3),
  })
  .strict();

export const quizQuestionItemSchema = z
  .object({
    id: slugSchema,
    order: z.number().int().min(1).max(6),
    left: quizSideSchema,
    right: quizSideSchema,
    /** Chip shown in chips mode (retake) instead of the two cards. */
    chip: z.string().min(1).max(24),
  })
  .strict();
export type QuizQuestionItem = z.infer<typeof quizQuestionItemSchema>;

export const QUIZ_LENGTH = 6;
