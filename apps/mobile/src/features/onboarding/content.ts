/**
 * The bundled onboarding content, read once: the this-or-that quiz, Tokek's scripted lines (no
 * model call; the typed name never leaves the device), the country's word for home, blocked name
 * words and the airport dataset.
 */
import { airportDataset } from '@cp/content/airports';
import {
  BLOCKED_NAME_WORDS,
  homeWord,
  onboardingQuiz,
  tokekLinesFor,
  tokekLineText,
  type QuizQuestionItem,
  type TokekLineTrigger,
} from '@cp/content/onboarding';

export { airportDataset, BLOCKED_NAME_WORDS, homeWord, onboardingQuiz };
export type { QuizQuestionItem, TokekLineTrigger };

/** Tokek's line for a moment, in the app's language; `pick` chooses among several (idle pool). */
export function tokekLine(
  trigger: TokekLineTrigger,
  locale: string,
  vars: Readonly<Record<string, string>> = {},
  pick = 0,
): string {
  const lines = tokekLinesFor(trigger);
  const line = lines[Math.abs(pick) % Math.max(1, lines.length)];
  if (line === undefined) return '';
  return tokekLineText(line, locale).replace(/\{(\w+)\}/gu, (_, key: string) => vars[key] ?? '');
}

export function tokekLineCount(trigger: TokekLineTrigger): number {
  return tokekLinesFor(trigger).length;
}
