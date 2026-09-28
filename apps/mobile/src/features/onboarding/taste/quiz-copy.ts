/**
 * The this-or-that card words in the app's language. The quiz release carries the English copy
 * and the tags; each known card is translated through the onboarding catalog, and a card from a
 * newer release the app has no words for yet shows the release's own text.
 */
import { t } from '@lingui/core/macro';

import type { QuizQuestionItem } from '../content';

export interface QuizCardWords {
  readonly label: string;
  readonly line: string;
}

function knownWords(key: string): QuizCardWords | null {
  switch (key) {
    case 'food.left':
      return {
        label: t({ id: 'onboarding.quiz.food.left.label', message: 'Street cart' }),
        line: t({ id: 'onboarding.quiz.food.left.line', message: 'Plastic stool, double order' }),
      };
    case 'food.right':
      return {
        label: t({ id: 'onboarding.quiz.food.right.label', message: 'Tasting menu' }),
        line: t({ id: 'onboarding.quiz.food.right.line', message: 'White cloth, tiny plates' }),
      };
    case 'pace.left':
      return {
        label: t({ id: 'onboarding.quiz.pace.left.label', message: 'Go go go' }),
        line: t({ id: 'onboarding.quiz.pace.left.line', message: 'Three cities, two days' }),
      };
    case 'pace.right':
      return {
        label: t({ id: 'onboarding.quiz.pace.right.label', message: 'One neighborhood' }),
        line: t({ id: 'onboarding.quiz.pace.right.line', message: 'Same café, same corner table' }),
      };
    case 'mornings.left':
      return {
        label: t({ id: 'onboarding.quiz.mornings.left.label', message: 'Sunrise summit' }),
        line: t({ id: 'onboarding.quiz.mornings.left.line', message: 'Up at 3, on top by 6' }),
      };
    case 'mornings.right':
      return {
        label: t({ id: 'onboarding.quiz.mornings.right.label', message: 'Sleep till ten' }),
        line: t({ id: 'onboarding.quiz.mornings.right.line', message: 'Breakfast is a lifestyle' }),
      };
    case 'evenings.left':
      return {
        label: t({ id: 'onboarding.quiz.evenings.left.label', message: 'Last call' }),
        line: t({
          id: 'onboarding.quiz.evenings.left.line',
          message: 'Midnight tapas, loud rooms',
        }),
      };
    case 'evenings.right':
      return {
        label: t({ id: 'onboarding.quiz.evenings.right.label', message: 'Home by nine' }),
        line: t({
          id: 'onboarding.quiz.evenings.right.line',
          message: 'Herbal tea and a book in bed',
        }),
      };
    case 'nature-vs-city.left':
      return {
        label: t({ id: 'onboarding.quiz.natureVsCity.left.label', message: 'Forest first' }),
        line: t({
          id: 'onboarding.quiz.natureVsCity.left.line',
          message: 'Moss, switchbacks, no signal',
        }),
      };
    case 'nature-vs-city.right':
      return {
        label: t({ id: 'onboarding.quiz.natureVsCity.right.label', message: 'City lights' }),
        line: t({
          id: 'onboarding.quiz.natureVsCity.right.line',
          message: 'Rooftop bars and metro stops',
        }),
      };
    case 'spending.left':
      return {
        label: t({ id: 'onboarding.quiz.spending.left.label', message: 'Treat yourself' }),
        line: t({
          id: 'onboarding.quiz.spending.left.line',
          message: 'Book the suite, skip the bus',
        }),
      };
    case 'spending.right':
      return {
        label: t({ id: 'onboarding.quiz.spending.right.label', message: 'Stretch a dollar' }),
        line: t({
          id: 'onboarding.quiz.spending.right.line',
          message: 'Street snacks, hostel dorm',
        }),
      };
    default:
      return null;
  }
}

export function quizCardWords(question: QuizQuestionItem, side: 'left' | 'right'): QuizCardWords {
  const content = question[side];
  return knownWords(`${question.id}.${side}`) ?? { label: content.label, line: content.line };
}
