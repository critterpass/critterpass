/**
 * 2.05 / 2.06 "What should the guides call you?": the name types onto the paper pass as it is
 * typed (the MRZ rewrites itself), Tokek reacts once typing pauses, and Next docks on the
 * keyboard. At the pass's 24-letter limit the field turns pink, says so, and offers shorter names.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Chip, GuideNote, Text, TextField, usePremiumTheme } from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { atNameLimit, nameSuggestions } from '../../name/name-suggestions';
import { useNameStep } from '../../name/use-name-step';
import { passFacts } from '../../pass-facts';
import { PassPaper } from '../components/PassPaper';
import { WizardPage } from '../components/WizardPage';

export function PremiumNamePage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const step = useNameStep();
  const { name, draft, problem } = step;
  const facts = passFacts({ ...draft, given_name: name }, locale);
  const limit = atNameLimit(name);
  const suggestions = limit ? nameSuggestions(name) : [];
  const blocked = problem === 'blocked';
  const tokek = guideFacts('tokek');
  // What sits under the field (the shorter names, Tokek's note) stays in sight while typing.
  const [trail, setTrail] = useState(0);
  // The keyboard goes with the name: the quiz after it has no field.
  const next = () => {
    if (problem === null && name.trim() !== '') Keyboard.dismiss();
    step.next();
  };
  return (
    <WizardPage
      keyboardTrail={trail}
      step={{ current: 1, total: 4 }}
      backLabel={t({ id: 'onboarding.invite.code.back', message: 'Back' })}
      onBack={() => router.back()}
      testID="onboarding-name"
      footer={
        <Button
          label={t({ id: 'onboarding.name.next', message: 'Next' })}
          onPress={next}
          disabled={problem !== null}
          testID="onboarding-name-next"
        />
      }
    >
      <PassPaper
        facts={facts}
        name={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="title" color={theme.color.onAccent} numberOfLines={1}>
              {name}
            </Text>
            <View
              style={{ width: 2, height: 22, marginStart: 1, backgroundColor: theme.color.caret }}
            />
          </View>
        }
        testID="onboarding-name-glyphs"
      />
      <Text variant="emptyTitle" accessibilityRole="header">
        {t({ id: 'onboarding.name.title', message: 'What should the guides call you?' })}
      </Text>
      <TextField
        accessibilityLabel={t({ id: 'onboarding.name.label', message: 'Your first name' })}
        value={name}
        onChangeText={step.onChange}
        key={step.focusReady ? 'focus' : 'wait'}
        autoFocus={step.focusReady}
        onFocus={step.onFocus}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        autoComplete="given-name"
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={next}
        error={
          blocked
            ? t({
                id: 'onboarding.premium.name.blocked',
                message: 'That one can’t go on a pass. Try another name.',
              })
            : limit
              ? t({
                  id: 'onboarding.premium.name.limit',
                  message: 'That’s the most a pass can print. Shorten it, or keep it as it is.',
                })
              : undefined
        }
        testID="onboarding-name-field"
      />
      <View
        style={{ gap: theme.space.gap16 }}
        onLayout={(event) => setTrail(event.nativeEvent.layout.height + theme.space.gap16)}
      >
        {suggestions.length > 0 ? (
          <View style={{ gap: theme.space.gap8 }} testID="onboarding-name-suggestions">
            <Text variant="caption" tone="muted">
              {t({ id: 'onboarding.premium.name.try', message: 'Try' })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
              {suggestions.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  surface="white"
                  onPress={() => step.onChange(option)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <GuideNote
          name={tokek.name}
          critter={tokek.kind}
          text={step.line}
          testID="onboarding-name-tokek"
        />
      </View>
    </WizardPage>
  );
}
