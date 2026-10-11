import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { nextQuestion, normalizeAnswers } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { onboardingQuiz } from '../content';
import { OnboardingPage } from '../page-chrome';
import { TasteQuiz } from './TasteQuiz';
import { useTasteStep } from './use-taste-step';

/** 3a-4 page: "THIS OR THAT", n OF 6, the quiz, then on to home base. */
export function TasteScreen() {
  const theme = useTheme();
  const locale = useLocale();
  const step = useTasteStep();
  const quiz = onboardingQuiz();
  const answered = normalizeAnswers(quiz, step.answers).length;
  const current = nextQuestion(quiz, step.answers) === null ? quiz.length : answered + 1;
  return (
    <OnboardingPage page={3} testID="onboarding-taste">
      {/* The title takes what the counter leaves, so a long translation wraps instead of running under it. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space['12'] }}>
        <Text variant="h1" accessibilityRole="header" style={{ flex: 1 }}>
          {t({ id: 'onboarding.taste.title', message: 'This or that' })}
        </Text>
        <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="taste-counter">
          {upper(
            t({ id: 'onboarding.taste.counter', message: `${current} of ${quiz.length}` }),
            locale,
          )}
        </Text>
      </View>
      <TasteQuiz answers={step.answers} onAnswersChange={step.onAnswersChange} onDone={step.done} />
    </OnboardingPage>
  );
}
