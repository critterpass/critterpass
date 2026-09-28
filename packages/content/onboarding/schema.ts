/**
 * Onboarding content: the this-or-that quiz (a `taste_quiz` release, 3a-4), Tokek's scripted
 * reaction pool (3a-2 onward; no model call, the name never leaves the device), the localized
 * "home" word per country for the HOME stamp (3a-5), and the words a pass name may not carry.
 */
import { z } from 'zod';

import { quizQuestionItemSchema, QUIZ_LENGTH } from '../src/schemas/taste-quiz';

export const TOKEK_LINE_TRIGGERS = [
  'intro',
  'idle',
  'long',
  'script',
  'blocked',
  'empty',
  'photo',
  'photo_real',
  'taste',
  'taste_skip',
  'taste_done',
  'home',
  'home_far',
] as const;
export type TokekLineTrigger = (typeof TOKEK_LINE_TRIGGERS)[number];

/** English is required; other locales fall back to it until a translation lands. */
export const tokekLineSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    when: z.enum(TOKEK_LINE_TRIGGERS),
    en: z.string().min(1).max(120),
  })
  .catchall(z.string().min(1).max(160));
export type TokekLine = z.infer<typeof tokekLineSchema>;

export const tokekLinesFileSchema = z
  .object({
    guide: z.literal('tokek'),
    lines: z.array(tokekLineSchema).min(20),
  })
  .strict();

export const homeWordsFileSchema = z.record(
  z.string().regex(/^[A-Z]{2}$/u),
  z.string().regex(/^[A-Z]{2,12}$/u, 'one upper-case Latin word'),
);

export const blockedNamesFileSchema = z
  .object({ note: z.string(), words: z.array(z.string().min(2)).min(1) })
  .strict();

/** The quiz items the app bundles (release envelope checked by the package tests). */
export const onboardingQuizItemsSchema = z.array(quizQuestionItemSchema).length(QUIZ_LENGTH);
