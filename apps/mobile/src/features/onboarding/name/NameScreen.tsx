/**
 * 3a-2 "What should the guides call you?": each typed letter drops onto the pass as it lands, the
 * MRZ rewrites itself, and Tokek reacts once typing pauses, from a scripted pool.
 */
import { t } from '@lingui/core/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { GlyphDrop } from '@/ui/pass-card';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { OnboardingPage } from '../page-chrome';
import { OnboardingPassCard } from '../pass-view';
import { TokekSays } from '../tokek-says';
import { useNameStep } from './use-name-step';

export { NAME_FOCUS_DELAY_MS } from './use-name-step';

export function NameScreen() {
  const theme = useTheme();
  const step = useNameStep();
  const { name, draft, problem } = step;
  return (
    <OnboardingPage
      page={1}
      testID="onboarding-name"
      footer={
        <PillButton
          label={t({ id: 'onboarding.name.next', message: 'Next' })}
          onPress={step.next}
          disabled={problem !== null}
          testID="onboarding-name-next"
        />
      }
    >
      <OnboardingPassCard
        draft={{ ...draft, given_name: name }}
        name={
          <GlyphDrop
            text={name}
            caret
            caretColor={theme.color.pink}
            testID="onboarding-name-glyphs"
          />
        }
      />
      <Text variant="h1" accessibilityRole="header">
        {t({ id: 'onboarding.name.title', message: 'What should the guides call you?' })}
      </Text>
      <TextField
        label={t({ id: 'onboarding.name.label', message: 'Your first name' })}
        labelHidden
        value={name}
        onChangeText={step.onChange}
        key={step.focusReady ? 'focus' : 'wait'}
        autoFocus={step.focusReady}
        onFocus={step.onFocus}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        autoComplete="given-name"
        returnKeyType="next"
        onSubmitEditing={step.next}
        status={problem === 'blocked' ? 'error' : 'idle'}
        testID="onboarding-name-field"
      />
      <TokekSays line={step.line} testID="onboarding-name-tokek" />
    </OnboardingPage>
  );
}
