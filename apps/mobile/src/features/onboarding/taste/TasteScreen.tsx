import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { advanceDraft, nextQuestion, normalizeAnswers } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { onboardingQuiz } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { OnboardingPage } from '../page-chrome';
import { TasteQuiz } from './TasteQuiz';

/** 3a-4 page: "THIS OR THAT", n OF 6, the quiz, then on to home base. */
export function TasteScreen() {
  useTrackStep('taste');
  const theme = useTheme();
  const locale = useLocale();
  const draft = usePassDraft() ?? ensureDraft();
  const quiz = onboardingQuiz();
  const answered = normalizeAnswers(quiz, draft.answers).length;
  const current = nextQuestion(quiz, draft.answers) === null ? quiz.length : answered + 1;
  return (
    <OnboardingPage page={3} testID="onboarding-taste">
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <Text variant="displayHero" accessibilityRole="header">
          {t({ id: 'onboarding.taste.title', message: 'This or that' })}
        </Text>
        <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="taste-counter">
          {upper(
            t({ id: 'onboarding.taste.counter', message: `${current} of ${quiz.length}` }),
            locale,
          )}
        </Text>
      </View>
      <TasteQuiz
        answers={draft.answers}
        onAnswersChange={(answers) => updateDraft((d) => ({ ...d, answers, taste_done: false }))}
        onDone={() => {
          const next = updateDraft((d) => advanceDraft({ ...d, taste_done: true }));
          if (next.step !== 'taste') router.push(routeForStep(next.step));
        }}
      />
    </OnboardingPage>
  );
}
