/**
 * Onboarding content for the app and the api. The quiz ships as a `taste_quiz` release envelope;
 * the checksum is verified by this package's tests (the app bundle cannot load `node:crypto`), so
 * at runtime the items are only read.
 */
import type { QuizQuestionItem } from '../src/schemas/taste-quiz';
import blockedNames from './blocked-names.json';
import homeWords from './home-words.json';
import quizRelease from './quiz.json';
import type { TokekLine, TokekLineTrigger } from './schema';
import tokekLines from './tokek-lines.json';

export * from './schema';
export type { QuizQuestionItem } from '../src/schemas/taste-quiz';

/** The raw bundled quiz release, for callers that verify it (`loadRelease`). */
export const ONBOARDING_QUIZ_RELEASE: unknown = quizRelease;

export function onboardingQuiz(): readonly QuizQuestionItem[] {
  return [...(quizRelease.items as QuizQuestionItem[])].sort((a, b) => a.order - b.order);
}

export const BLOCKED_NAME_WORDS: readonly string[] = blockedNames.words;

export function tokekLinesFor(trigger: TokekLineTrigger): readonly TokekLine[] {
  return (tokekLines.lines as TokekLine[]).filter((line) => line.when === trigger);
}

/** The line in the given locale (base language tried too), else English. */
export function tokekLineText(line: TokekLine, locale: string): string {
  const base = locale.split('-')[0] ?? locale;
  return line[locale] ?? line[base] ?? line.en;
}

/** The country's own word for home on the HOME stamp; "HOME" when none is recorded. */
export function homeWord(country: string | null): string {
  if (country === null) return 'HOME';
  return (homeWords as Record<string, string>)[country] ?? 'HOME';
}
