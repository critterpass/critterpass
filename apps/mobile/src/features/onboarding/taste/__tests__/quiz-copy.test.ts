import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { loadAllCatalogs } from '@cp/i18n';

import { onboardingQuiz } from '../../content';
import { quizCardWords } from '../quiz-copy';

const SIDES = ['left', 'right'] as const;

describe('this-or-that card words', () => {
  it('match the bundled quiz release in English', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadAllCatalogs('en') });
    for (const question of onboardingQuiz()) {
      for (const side of SIDES) {
        const words = quizCardWords(question, side);
        expect(words.label.toUpperCase()).toBe(question[side].label.toUpperCase());
        expect(words.line).toBe(question[side].line);
      }
    }
  });

  it('are translated for every card in Vietnamese', async () => {
    i18n.loadAndActivate({ locale: 'vi', messages: await loadAllCatalogs('vi') });
    for (const question of onboardingQuiz()) {
      for (const side of SIDES) {
        const words = quizCardWords(question, side);
        expect(words.label.toUpperCase()).not.toBe(question[side].label.toUpperCase());
        expect(words.line).not.toBe(question[side].line);
      }
    }
    expect(quizCardWords(onboardingQuiz()[2]!, 'left').label).toBe('Đỉnh núi bình minh');
  });

  it('fall back to the release text for a card the app has no words for', () => {
    const [first] = onboardingQuiz();
    const unknown = { ...first!, id: 'late-trains' };
    expect(quizCardWords(unknown, 'right')).toEqual({
      label: first!.right.label,
      line: first!.right.line,
    });
  });
});
