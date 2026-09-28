import { describe, expect, it } from 'vitest';

import { tasteFromChips, toggleChip } from '../chips';
import {
  nextQuestion,
  passStyleTags,
  tasteFromAnswers,
  undoLastAnswer,
  type QuizQuestionShape,
  type TasteAnswer,
} from '../quiz-to-tags';
import type { TasteTag } from '../taxonomy';

const q = (id: string, order: number, left: TasteTag[], right: TasteTag[]): QuizQuestionShape => ({
  id,
  order,
  left: { tags: left },
  right: { tags: right },
});

const QUIZ = [
  q('mornings', 3, ['early_starts', 'hiking'], ['late_starts', 'easy_pace']),
  q('food', 1, ['street_food', 'thrifty', 'local_life'], ['sit_down_dining', 'splurge']),
  q('pace', 2, ['packed_days', 'adventure'], ['easy_pace', 'coffee', 'local_life']),
  q('evenings', 4, ['nightlife', 'late_starts'], ['quiet_evenings', 'wellness', 'easy_pace']),
  q('nature', 5, ['nature', 'hiking', 'adventure'], ['nightlife', 'local_life', 'photo_spots']),
  q('spending', 6, ['splurge', 'wellness'], ['thrifty', 'markets']),
];

const answer = (q_id: string, value: TasteAnswer['value']): TasteAnswer => ({ q_id, value });

describe('tasteFromAnswers', () => {
  it('ranks tags by picks, then by quiz order', () => {
    const result = tasteFromAnswers(QUIZ, [
      answer('mornings', 'left'),
      answer('food', 'left'),
      answer('pace', 'right'),
      answer('evenings', 'right'),
      answer('nature', 'left'),
      answer('spending', 'right'),
    ]);
    expect(result.tags.slice(0, 4)).toEqual(['thrifty', 'local_life', 'easy_pace', 'hiking']);
    expect(result.chronotype).toBe('early');
    expect(result.pace).toBe('easy');
    expect(result.tagSources.local_life).toBe('quiz');
    expect(passStyleTags(result.tags)).toHaveLength(3);
  });

  it('adds nothing for skipped questions and keeps the latest answer', () => {
    const result = tasteFromAnswers(QUIZ, [
      answer('food', 'left'),
      answer('food', 'right'),
      answer('pace', 'skip'),
      answer('unknown', 'left'),
    ]);
    expect(result.tags).toEqual(['sit_down_dining', 'splurge']);
  });

  it('walks questions in order with undo', () => {
    let answers: TasteAnswer[] = [];
    expect(nextQuestion(QUIZ, answers)?.id).toBe('food');
    answers = [answer('food', 'left'), answer('pace', 'skip')];
    expect(nextQuestion(QUIZ, answers)?.id).toBe('mornings');
    answers = undoLastAnswer(answers);
    expect(nextQuestion(QUIZ, answers)?.id).toBe('pace');
    expect(
      nextQuestion(
        QUIZ,
        QUIZ.map((x) => answer(x.id, 'left')),
      ),
    ).toBeNull();
  });
});

describe('chips mode', () => {
  it('toggles a side and records chips as the source', () => {
    let answers = toggleChip([], 'food', 'left');
    answers = toggleChip(answers, 'food', 'right');
    expect(answers).toEqual([answer('food', 'right')]);
    expect(toggleChip(answers, 'food', 'right')).toEqual([]);
    expect(tasteFromChips(QUIZ, answers).tagSources.splurge).toBe('chips');
  });
});
