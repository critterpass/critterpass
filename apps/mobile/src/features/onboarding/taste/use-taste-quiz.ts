/**
 * This or that's working state, shared by the current quiz and the premium page: the question up
 * now, the tags so far (and which of them landed this visit), picking a side (the other card flings
 * away first), skipping, undoing, and Tokek's line for the last move.
 */
import { useEffect, useRef, useState } from 'react';

import {
  nextQuestion,
  normalizeAnswers,
  tasteFromAnswers,
  undoLastAnswer,
  type TasteAnswer,
} from '@cp/domain';

import { feedback } from '@/motion/feedback';

import { onboardingQuiz } from '../content';

export type QuizSide = 'left' | 'right';

/** How long the other card takes to fling away before the answer is recorded. */
export const QUIZ_FLING_MS = 560;

export function useTasteQuiz(
  answers: readonly TasteAnswer[],
  onAnswersChange: (answers: TasteAnswer[]) => void,
  flingMs: number = QUIZ_FLING_MS,
) {
  const quiz = onboardingQuiz();
  const question = nextQuestion(quiz, answers);
  const [flinging, setFlinging] = useState<QuizSide | null>(null);
  const [stampedFrom] = useState(() => normalizeAnswers(quiz, answers).length);
  const [lastTrigger, setLastTrigger] = useState<'taste' | 'taste_skip'>('taste');
  const answeredCount = normalizeAnswers(quiz, answers).length;
  const flingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flingTimer.current !== null) clearTimeout(flingTimer.current);
    },
    [],
  );

  const record = (value: TasteAnswer['value']) => {
    if (question === null) return;
    onAnswersChange([...answers, { q_id: question.id, value }]);
  };

  const pick = (side: QuizSide) => {
    if (question === null || flinging !== null) return;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id.
    feedback.emit('thud.heavy');
    setFlinging(side);
    setLastTrigger('taste');
    flingTimer.current = setTimeout(() => {
      flingTimer.current = null;
      setFlinging(null);
      record(side);
    }, flingMs);
  };

  const skip = () => {
    if (flinging !== null) return;
    feedback.emit('tick');
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
    setLastTrigger('taste_skip');
    record('skip');
  };

  const undo = () => {
    if (flinging !== null) return;
    feedback.emit('tick');
    onAnswersChange(undoLastAnswer(normalizeAnswers(quiz, answers)));
  };

  return {
    quiz,
    question,
    tags: tasteFromAnswers(quiz, answers).tags,
    stampedFrom,
    answeredCount,
    /** 1-based question number shown in the counter (the quiz length once done). */
    current: question === null ? quiz.length : answeredCount + 1,
    flinging,
    lastTrigger,
    pick,
    skip,
    undo,
    restart: () => onAnswersChange([]),
  };
}
