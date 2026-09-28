/**
 * Chips mode (3a-12 "your pass, three taps" and the retake sheet): each question becomes one chip
 * with its two sides as options. Picks are the same answers as the cards, recorded as `chips`.
 */
import {
  tasteFromAnswers,
  type QuizQuestionShape,
  type TasteAnswer,
  type TasteResult,
} from './quiz-to-tags';

export interface ChipOption<Q extends QuizQuestionShape> {
  readonly question: Q;
  readonly sides: readonly ['left', 'right'];
}

export function chipOptions<Q extends QuizQuestionShape>(quiz: readonly Q[]): ChipOption<Q>[] {
  return [...quiz]
    .sort((a, b) => a.order - b.order)
    .map((question) => ({ question, sides: ['left', 'right'] as const }));
}

/** Toggling a chip side: picking the chosen side again clears it back to unanswered. */
export function toggleChip(
  answers: readonly TasteAnswer[],
  qId: string,
  side: 'left' | 'right',
): TasteAnswer[] {
  const current = answers.find((a) => a.q_id === qId);
  const rest = answers.filter((a) => a.q_id !== qId);
  return current?.value === side ? rest : [...rest, { q_id: qId, value: side }];
}

export function tasteFromChips(
  quiz: readonly QuizQuestionShape[],
  answers: readonly TasteAnswer[],
): TasteResult {
  return tasteFromAnswers(quiz, answers, 'chips');
}
